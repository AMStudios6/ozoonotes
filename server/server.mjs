import { createServer } from 'node:http'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
const databasePath = process.env.DOOMNOTES_DB ?? join(process.cwd(), 'data', 'doomnotes.sqlite')
const staticRoot = resolve(process.cwd(), 'dist')
mkdirSync(dirname(databasePath), { recursive: true })
const db = new DatabaseSync(databasePath)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, UNIQUE(owner_id, name));
  CREATE TABLE IF NOT EXISTS boards (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL, name TEXT NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS board_access (board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('view','edit')), PRIMARY KEY(board_id,user_id));
  CREATE TABLE IF NOT EXISTS public_links (token TEXT PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS team_members (team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'member', PRIMARY KEY(team_id,user_id));
  CREATE TABLE IF NOT EXISTS team_board_access (team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE, role TEXT NOT NULL CHECK(role IN ('view','edit')), PRIMARY KEY(team_id,board_id));
  CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`)
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name)
if (!userColumns.includes('google_sub')) db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub) WHERE google_sub IS NOT NULL')

db.exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)')
const eventClients = new Map()
const googleStates = new Map()
const cookieName = 'doomnotes_session'
const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
const googleStateCookie = 'doomnotes_google_state'
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI ?? ''
const appOrigin = process.env.APP_ORIGIN ?? 'https://ozoonotes.com'
const allowedOrigins = new Set([appOrigin, 'https://www.ozoonotes.com', 'http://localhost:5173', 'http://127.0.0.1:5173'])
const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && googleRedirectUri)
const sessionTokenHash = (token) => createHash('sha256').update(token).digest('hex')
const createSession = (userId) => {
  const token = randomBytes(32).toString('hex')
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sessionTokenHash(token), userId, Date.now() + 30 * 24 * 60 * 60 * 1000)
  return token
}
const sendJson = (res, status, data, extra = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra })
  res.end(JSON.stringify(data))
}
const readBody = (req, limit = 60 * 1024 * 1024) => new Promise((resolve, reject) => {
  const chunks = []
  let size = 0
  req.on('data', (chunk) => { size += chunk.length; if (size > limit) { reject(new Error('Request is too large')); req.destroy(); return } chunks.push(chunk) })
  req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) } catch { reject(new Error('Invalid JSON body')) } })
  req.on('error', reject)
})
const sessionUser = (req) => {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))
  const sessionId = cookie?.slice(cookieName.length + 1)
  if (!sessionId) return null
  const hash = sessionTokenHash(sessionId)
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())
  return db.prepare('SELECT users.id, users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?').get(hash, Date.now()) ?? null
}
const notifyBoard = (boardId, type) => {
  for (const client of eventClients.get(boardId) ?? []) client.write(`event: ${type}\ndata: {}\n\n`)
}
const boardRole = (boardId, userId) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId)
  if (!board) return null
  if (board.owner_id === userId) return { board, role: 'owner' }
  const access = db.prepare('SELECT role FROM board_access WHERE board_id = ? AND user_id = ?').get(boardId, userId)
  const teamAccess = db.prepare('SELECT tba.role FROM team_board_access tba JOIN team_members tm ON tm.team_id=tba.team_id WHERE tba.board_id=? AND tm.user_id=? ORDER BY CASE tba.role WHEN \'edit\' THEN 0 ELSE 1 END LIMIT 1').get(boardId, userId)
  const role = access?.role === 'edit' || teamAccess?.role === 'edit' ? 'edit' : access?.role ?? teamAccess?.role
  return role ? { board, role } : null
}
const shapeBoard = (row) => ({ id: row.id, ownerId: row.owner_id, ownerName: db.prepare('SELECT username FROM users WHERE id = ?').get(row.owner_id)?.username, folderId: row.folder_id, name: row.name, state: JSON.parse(row.state_json), updatedAt: row.updated_at })

async function handler(req, res) {
  const origin = req.headers.origin
  if (origin && !allowedOrigins.has(origin)) return sendJson(res, 403, { error: 'This website is not allowed to use the OzooNotes API.' })
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Last-Event-ID', 'Access-Control-Max-Age': '600' }).end()
    return
  }
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const route = url.pathname
  const method = req.method ?? 'GET'
  try {
    if (route === '/api/health') return sendJson(res, 200, { ok: true })
    if (route === '/api/auth/providers' && method === 'GET') return sendJson(res, 200, { google: googleEnabled })
    if (route === '/api/auth/google' && method === 'GET') {
      if (!googleEnabled) return sendJson(res, 503, { error: 'Google sign-in is not configured on this OzooNotes server yet.' })
      const now = Date.now()
      for (const [key, entry] of googleStates) if (entry.expiresAt <= now) googleStates.delete(key)
      const state = randomBytes(32).toString('hex')
      const browserBinding = randomBytes(32).toString('hex')
      googleStates.set(state, { browserBinding, expiresAt: now + 10 * 60 * 1000 })
      const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      authorization.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: googleRedirectUri, response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' }).toString()
      return res.writeHead(302, { Location: authorization.toString(), 'Set-Cookie': `${googleStateCookie}=${browserBinding}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`, 'Cache-Control': 'no-store' }).end()
    }
    if (route === '/api/auth/google/callback' && method === 'GET') {
      if (!googleEnabled) return sendJson(res, 503, { error: 'Google sign-in is not configured on this OzooNotes server yet.' })
      const state = url.searchParams.get('state') ?? ''
      const stateEntry = googleStates.get(state)
      googleStates.delete(state)
      const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${googleStateCookie}=`))
      const browserBinding = cookie?.slice(googleStateCookie.length + 1)
      const clearStateCookie = `${googleStateCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
      if (url.searchParams.has('error')) return sendJson(res, 400, { error: 'Google sign-in was cancelled.' }, { 'Set-Cookie': clearStateCookie })
      const code = url.searchParams.get('code')
      if (!stateEntry || stateEntry.expiresAt <= Date.now() || stateEntry.browserBinding !== browserBinding || !code) return sendJson(res, 400, { error: 'Google sign-in expired or could not be verified. Please try again.' }, { 'Set-Cookie': clearStateCookie })
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: googleRedirectUri, grant_type: 'authorization_code' }) })
      const token = await tokenResponse.json()
      if (!tokenResponse.ok || typeof token.access_token !== 'string') return sendJson(res, 401, { error: 'Google could not complete sign-in. Check the OAuth redirect URI and try again.' }, { 'Set-Cookie': clearStateCookie })
      const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } })
      const profile = await profileResponse.json()
      if (!profileResponse.ok || typeof profile.sub !== 'string' || !profile.sub || profile.email_verified !== true) return sendJson(res, 401, { error: 'Google did not return a verified account.' }, { 'Set-Cookie': clearStateCookie })
      let user = db.prepare('SELECT id, username FROM users WHERE google_sub = ?').get(profile.sub)
      if (!user) {
        const emailPrefix = String(profile.email ?? 'google_user').split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24) || 'google_user'
        let username = emailPrefix
        while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) username = `${emailPrefix.slice(0, 23)}_${randomBytes(3).toString('hex')}`
        const salt = randomBytes(16).toString('hex')
        const hash = randomBytes(64).toString('hex')
        const result = db.prepare('INSERT INTO users(username,salt,password_hash,google_sub) VALUES(?,?,?,?)').run(username, salt, hash, profile.sub)
        user = { id: Number(result.lastInsertRowid), username }
      }
      const sessionId = createSession(user.id)
      return res.writeHead(303, { Location: `${appOrigin.replace(/\/$/, '')}/`, 'Set-Cookie': [`${cookieName}=${sessionId}; ${cookieFlags}; Max-Age=2592000`, clearStateCookie], 'Cache-Control': 'no-store' }).end()
    }
    if (route === '/api/auth/register' && method === 'POST') {
      const { username, password } = await readBody(req)
      const cleanName = String(username ?? '').trim()
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanName) || typeof password !== 'string' || password.length < 12) return sendJson(res, 400, { error: 'Use a 3–32 character username and a password of at least 12 characters.' })
      const salt = randomBytes(16).toString('hex')
      const hash = scryptSync(password, salt, 64).toString('hex')
      const result = db.prepare('INSERT INTO users(username,salt,password_hash) VALUES(?,?,?)').run(cleanName, salt, hash)
      const sessionId = randomBytes(32).toString('hex')
      db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sessionTokenHash(sessionId), Number(result.lastInsertRowid), Date.now() + 30 * 24 * 60 * 60 * 1000)
      return sendJson(res, 201, { user: { id: Number(result.lastInsertRowid), username: cleanName } }, { 'Set-Cookie': `${cookieName}=${sessionId}; ${cookieFlags}` })
    }
    if (route === '/api/auth/login' && method === 'POST') {
      const { username, password } = await readBody(req)
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username ?? '').trim())
      if (!user || typeof password !== 'string') return sendJson(res, 401, { error: 'Username or password is incorrect.' })
      const candidate = scryptSync(password, user.salt, 64)
      if (!timingSafeEqual(candidate, Buffer.from(user.password_hash, 'hex'))) return sendJson(res, 401, { error: 'Username or password is incorrect.' })
      const sessionId = randomBytes(32).toString('hex')
      db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sessionTokenHash(sessionId), user.id, Date.now() + 30 * 24 * 60 * 60 * 1000)
      return sendJson(res, 200, { user: { id: user.id, username: user.username } }, { 'Set-Cookie': `${cookieName}=${sessionId}; ${cookieFlags}` })
    }
    if (route === '/api/auth/logout' && method === 'POST') {
      const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))
      if (cookie) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sessionTokenHash(cookie.slice(cookieName.length + 1)))
      return sendJson(res, 200, { ok: true }, { 'Set-Cookie': `${cookieName}=; ${cookieFlags}; Max-Age=0` })
    }
    const publicBoard = route.match(/^\/api\/public\/([a-f0-9]+)$/)
    if (publicBoard && method === 'GET') {
      const row = db.prepare('SELECT b.* FROM boards b JOIN public_links p ON p.board_id=b.id WHERE p.token=?').get(publicBoard[1])
      return row ? sendJson(res, 200, { board: shapeBoard(row), access: 'view' }) : sendJson(res, 404, { error: 'This read-only link is invalid or revoked.' })
    }
    // Serve the frontend before the cloud API's sign-in guard.
    if (method === 'GET' && !route.startsWith('/api') && existsSync(join(staticRoot, 'index.html'))) {
      let decodedRoute
      try { decodedRoute = decodeURIComponent(route) } catch { return sendJson(res, 400, { error: 'Invalid URL path.' }) }
      const requestedFile = resolve(staticRoot, `.${decodedRoute}`)
      if (requestedFile !== staticRoot && !requestedFile.startsWith(`${staticRoot}${sep}`)) return sendJson(res, 403, { error: 'Forbidden.' })
      const filePath = existsSync(requestedFile) && statSync(requestedFile).isFile() ? requestedFile : join(staticRoot, 'index.html')
      const contentTypes = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp' }
      res.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream', 'Cache-Control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' })
      createReadStream(filePath).pipe(res)
      return
    }
    const user = sessionUser(req)
    if (route === '/api/me' && method === 'GET') return user ? sendJson(res, 200, { user }) : sendJson(res, 200, { user: null })
    if (!user) return sendJson(res, 401, { error: 'Sign in to use cloud features.' })

    if (route === '/api/folders' && method === 'GET') return sendJson(res, 200, { folders: db.prepare('SELECT id,name FROM folders WHERE owner_id = ? ORDER BY name').all(user.id) })
    if (route === '/api/folders' && method === 'POST') {
      const { name } = await readBody(req)
      const cleanName = String(name ?? '').trim().slice(0, 80)
      if (!cleanName) return sendJson(res, 400, { error: 'Folder name is required.' })
      const result = db.prepare('INSERT INTO folders(owner_id,name) VALUES(?,?)').run(user.id, cleanName)
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), name: cleanName })
    }
    if (route === '/api/boards' && method === 'GET') {
      const rows = db.prepare('SELECT DISTINCT b.* FROM boards b LEFT JOIN board_access a ON a.board_id=b.id LEFT JOIN team_board_access tba ON tba.board_id=b.id LEFT JOIN team_members tm ON tm.team_id=tba.team_id WHERE b.owner_id=? OR a.user_id=? OR tm.user_id=? ORDER BY b.updated_at DESC').all(user.id, user.id, user.id)
      return sendJson(res, 200, { boards: rows.map(shapeBoard) })
    }
    if (route === '/api/boards' && method === 'POST') {
      const { name, folderId, state } = await readBody(req)
      const cleanName = String(name ?? '').trim().slice(0, 120)
      if (!cleanName || !state || typeof state !== 'object') return sendJson(res, 400, { error: 'Board name and board data are required.' })
      if (folderId && !db.prepare('SELECT id FROM folders WHERE id=? AND owner_id=?').get(folderId, user.id)) return sendJson(res, 400, { error: 'That folder does not exist.' })
      const result = db.prepare('INSERT INTO boards(owner_id,folder_id,name,state_json) VALUES(?,?,?,?)').run(user.id, folderId || null, cleanName, JSON.stringify(state))
      const board = db.prepare('SELECT * FROM boards WHERE id=?').get(Number(result.lastInsertRowid))
      return sendJson(res, 201, { board: shapeBoard(board) })
    }

    const boardEvents = route.match(/^\/api\/boards\/(\d+)\/events$/)
    if (boardEvents && method === 'GET') {
      const id = Number(boardEvents[1])
      if (!boardRole(id, user.id)) return sendJson(res, 403, { error: 'You do not have access to this board.' })
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
      res.write('event: ready\ndata: {}\n\n')
      const listeners = eventClients.get(id) ?? new Set()
      listeners.add(res)
      eventClients.set(id, listeners)
      req.on('close', () => { listeners.delete(res); if (!listeners.size) eventClients.delete(id) })
      return
    }
    const boardMatch = route.match(/^\/api\/boards\/(\d+)(?:\/(share|public-link|comments|teams))?$/)
    if (boardMatch) {
      const id = Number(boardMatch[1])
      const action = boardMatch[2]
      const permission = boardRole(id, user.id)
      if (!permission) return sendJson(res, 403, { error: 'You do not have access to this board.' })
      if (!action && method === 'GET') return sendJson(res, 200, { board: shapeBoard(permission.board), role: permission.role })
      if (!action && method === 'PUT') {
        if (permission.role === 'view') return sendJson(res, 403, { error: 'This board is read-only for your account.' })
        const { name, folderId, state } = await readBody(req)
        if (!state || typeof state !== 'object') return sendJson(res, 400, { error: 'Board data is required.' })
        if (folderId && !db.prepare('SELECT id FROM folders WHERE id=? AND owner_id=?').get(folderId, permission.board.owner_id)) return sendJson(res, 400, { error: 'That folder does not exist for this board owner.' })
        db.prepare('UPDATE boards SET name=?,folder_id=?,state_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(name ?? permission.board.name).slice(0, 120), folderId || null, JSON.stringify(state), id)
        notifyBoard(id, 'board-updated')
        return sendJson(res, 200, { board: shapeBoard(db.prepare('SELECT * FROM boards WHERE id=?').get(id)) })
      }
      if (action === 'share' && method === 'GET') {
        if (permission.role !== 'owner') return sendJson(res, 403, { error: 'Only the board owner can manage access.' })
        const rows = db.prepare('SELECT u.id,u.username,a.role FROM board_access a JOIN users u ON u.id=a.user_id WHERE a.board_id=? ORDER BY u.username').all(id)
        return sendJson(res, 200, { access: rows })
      }
      if (action === 'share' && method === 'POST') {
        if (permission.role !== 'owner') return sendJson(res, 403, { error: 'Only the board owner can manage access.' })
        const { username, role } = await readBody(req)
        const target = db.prepare('SELECT id FROM users WHERE username=?').get(String(username ?? '').trim())
        if (!target) return sendJson(res, 404, { error: 'Create an account for that person first.' })
        if (!['view', 'edit'].includes(role)) return sendJson(res, 400, { error: 'Choose view or edit access.' })
        db.prepare('INSERT INTO board_access(board_id,user_id,role) VALUES(?,?,?) ON CONFLICT(board_id,user_id) DO UPDATE SET role=excluded.role').run(id, target.id, role)
        notifyBoard(id, 'access-updated')
        return sendJson(res, 200, { username, role })
      }
      if (action === 'share' && method === 'DELETE') {
        if (permission.role !== 'owner') return sendJson(res, 403, { error: 'Only the board owner can manage access.' })
        const { username } = await readBody(req)
        db.prepare('DELETE FROM board_access WHERE board_id=? AND user_id=(SELECT id FROM users WHERE username=?)').run(id, String(username ?? '').trim())
        return sendJson(res, 200, { ok: true })
      }
      if (action === 'teams' && method === 'GET') {
        if (permission.role !== 'owner') return sendJson(res, 403, { error: 'Only the board owner can manage team access.' })
        return sendJson(res, 200, { teams: db.prepare('SELECT t.id,t.name,tba.role FROM team_board_access tba JOIN teams t ON t.id=tba.team_id WHERE tba.board_id=? AND t.owner_id=?').all(id, user.id) })
      }
      if (action === 'teams' && method === 'POST') {
        if (permission.role !== 'owner') return sendJson(res, 403, { error: 'Only the board owner can manage team access.' })
        const { teamId, role } = await readBody(req)
        if (!['view','edit'].includes(role) || !db.prepare('SELECT id FROM teams WHERE id=? AND owner_id=?').get(teamId, user.id)) return sendJson(res, 400, { error: 'Choose a team you own and a valid permission.' })
        db.prepare('INSERT INTO team_board_access(team_id,board_id,role) VALUES(?,?,?) ON CONFLICT(team_id,board_id) DO UPDATE SET role=excluded.role').run(teamId, id, role)
        notifyBoard(id, 'access-updated')
        return sendJson(res, 200, { ok: true })
      }
      if (action === 'teams' && method === 'DELETE') {
        if (permission.role !== 'owner') return sendJson(res, 403, { error: 'Only the board owner can manage team access.' })
        const { teamId } = await readBody(req)
        db.prepare('DELETE FROM team_board_access WHERE team_id=? AND board_id=?').run(teamId, id)
        return sendJson(res, 200, { ok: true })
      }
      if (action === 'public-link' && method === 'POST') {
        if (permission.role !== 'owner') return sendJson(res, 403, { error: 'Only the board owner can create a public link.' })
        const token = randomBytes(24).toString('hex')
        db.prepare('INSERT INTO public_links(token,board_id) VALUES(?,?)').run(token, id)
        return sendJson(res, 201, { url: `/shared/${token}`, token })
      }
      if (action === 'public-link' && method === 'DELETE') {
        if (permission.role !== 'owner') return sendJson(res, 403, { error: 'Only the board owner can revoke public links.' })
        db.prepare('DELETE FROM public_links WHERE board_id=?').run(id)
        return sendJson(res, 200, { ok: true })
      }
      if (action === 'comments' && method === 'GET') {
        const rows = db.prepare('SELECT c.id,c.body,c.created_at AS createdAt,u.username FROM comments c JOIN users u ON u.id=c.user_id WHERE c.board_id=? ORDER BY c.id').all(id)
        return sendJson(res, 200, { comments: rows })
      }
      if (action === 'comments' && method === 'POST') {
        const { body } = await readBody(req)
        const cleanBody = String(body ?? '').trim().slice(0, 4000)
        if (!cleanBody) return sendJson(res, 400, { error: 'Write a comment first.' })
        const result = db.prepare('INSERT INTO comments(board_id,user_id,body) VALUES(?,?,?)').run(id, user.id, cleanBody)
        notifyBoard(id, 'comment-added')
        return sendJson(res, 201, { comment: db.prepare('SELECT c.id,c.body,c.created_at AS createdAt,u.username FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(Number(result.lastInsertRowid)) })
      }
    }
    const teamCollection = route.match(/^\/api\/teams(?:\/(\d+)\/members)?$/)
    if (teamCollection && method === 'GET' && !teamCollection[1]) return sendJson(res, 200, { teams: db.prepare('SELECT DISTINCT t.* FROM teams t JOIN team_members tm ON tm.team_id=t.id WHERE tm.user_id=? ORDER BY t.name').all(user.id) })
    if (teamCollection && method === 'GET' && teamCollection[1]) {
      const teamId = Number(teamCollection[1])
      if (!db.prepare('SELECT team_id FROM team_members WHERE team_id=? AND user_id=?').get(teamId, user.id)) return sendJson(res, 403, { error: 'You are not a member of this team.' })
      return sendJson(res, 200, { members: db.prepare('SELECT u.username,tm.role FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=? ORDER BY u.username').all(teamId) })
    }
    if (teamCollection && method === 'POST' && !teamCollection[1]) {
      const { name } = await readBody(req)
      const cleanName = String(name ?? '').trim().slice(0, 80)
      if (!cleanName) return sendJson(res, 400, { error: 'Team name is required.' })
      const result = db.prepare('INSERT INTO teams(owner_id,name) VALUES(?,?)').run(user.id, cleanName)
      db.prepare('INSERT INTO team_members(team_id,user_id,role) VALUES(?,?,?)').run(Number(result.lastInsertRowid), user.id, 'owner')
      return sendJson(res, 201, { id: Number(result.lastInsertRowid), name: cleanName })
    }
    if (teamCollection && method === 'POST' && teamCollection[1]) {
      const teamId = Number(teamCollection[1])
      const owner = db.prepare('SELECT id FROM teams WHERE id=? AND owner_id=?').get(teamId, user.id)
      if (!owner) return sendJson(res, 403, { error: 'Only the team owner can add members.' })
      const { username } = await readBody(req)
      const target = db.prepare('SELECT id FROM users WHERE username=?').get(String(username ?? '').trim())
      if (!target) return sendJson(res, 404, { error: 'Create an account for that person first.' })
      db.prepare('INSERT OR IGNORE INTO team_members(team_id,user_id) VALUES(?,?)').run(teamId, target.id)
      return sendJson(res, 201, { username })
    }
    return sendJson(res, 404, { error: 'Not found.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Server error'
    const status = message.includes('UNIQUE constraint failed') ? 409 : message === 'Request is too large' ? 413 : 400
    return sendJson(res, status, { error: status === 409 ? 'That username or folder already exists.' : message })
  }
}

createServer((req, res) => { void handler(req, res) }).listen(port, host, () => console.log(`OzooNotes server listening at http://${host}:${port}`))

