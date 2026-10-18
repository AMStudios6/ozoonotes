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
if (!userColumns.includes('github_id')) db.exec('ALTER TABLE users ADD COLUMN github_id TEXT')
if (!userColumns.includes('email')) db.exec('ALTER TABLE users ADD COLUMN email TEXT COLLATE NOCASE')
if (!userColumns.includes('email_verified_at')) db.exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER')
if (!userColumns.includes('display_name')) db.exec('ALTER TABLE users ADD COLUMN display_name TEXT')
if (!userColumns.includes('avatar_data')) db.exec('ALTER TABLE users ADD COLUMN avatar_data TEXT')
if (!userColumns.includes('password_enabled')) {
  db.exec('ALTER TABLE users ADD COLUMN password_enabled INTEGER NOT NULL DEFAULT 1')
  db.exec('UPDATE users SET password_enabled=0 WHERE google_sub IS NOT NULL OR github_id IS NOT NULL')
}
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub) WHERE google_sub IS NOT NULL')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_github_id_unique ON users(github_id) WHERE github_id IS NOT NULL')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL')

db.exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)')
db.exec(`CREATE TABLE IF NOT EXISTS auth_tokens (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, purpose TEXT NOT NULL CHECK(purpose IN ('verify-email','reset-password')), expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`)
db.exec(`CREATE TABLE IF NOT EXISTS auth_mail_limits (email_hash TEXT NOT NULL, purpose TEXT NOT NULL, window_started_at INTEGER NOT NULL, sent_count INTEGER NOT NULL, last_sent_at INTEGER NOT NULL, PRIMARY KEY(email_hash,purpose))`)
const eventClients = new Map()
const googleStates = new Map()
const githubStates = new Map()
const cookieName = 'doomnotes_session'
const cookieFlags = `Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
const googleStateCookie = 'doomnotes_google_state'
const googleRedirectUri = process.env.GOOGLE_REDIRECT_URI ?? ''
const githubStateCookie = 'doomnotes_github_state'
const githubRedirectUri = process.env.GITHUB_REDIRECT_URI ?? ''
const appOrigin = process.env.APP_ORIGIN ?? 'https://ozoonotes.com'
const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
const allowedOrigins = new Set([appOrigin, 'https://www.ozoonotes.com', 'http://localhost:5173', 'http://127.0.0.1:5173'])
const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && googleRedirectUri)
const githubEnabled = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && githubRedirectUri)
const sessionTokenHash = (token) => createHash('sha256').update(token).digest('hex')
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254
const createAuthToken = (userId, purpose, ttlMs) => {
  const token = randomBytes(32).toString('hex')
  db.prepare('DELETE FROM auth_tokens WHERE user_id=? AND purpose=?').run(userId, purpose)
  db.prepare('INSERT INTO auth_tokens(token_hash,user_id,purpose,expires_at,created_at) VALUES(?,?,?,?,?)').run(sessionTokenHash(token), userId, purpose, Date.now() + ttlMs, Date.now())
  return token
}
const canSendAuthEmail = (email, purpose) => {
  const now = Date.now()
  const emailHash = sessionTokenHash(email.toLowerCase())
  const row = db.prepare('SELECT * FROM auth_mail_limits WHERE email_hash=? AND purpose=?').get(emailHash, purpose)
  if (row && now - row.last_sent_at < 60_000) return false
  if (row && now - row.window_started_at < 60 * 60 * 1000 && row.sent_count >= 5) return false
  if (!row || now - row.window_started_at >= 60 * 60 * 1000) {
    db.prepare('INSERT INTO auth_mail_limits(email_hash,purpose,window_started_at,sent_count,last_sent_at) VALUES(?,?,?,1,?) ON CONFLICT(email_hash,purpose) DO UPDATE SET window_started_at=excluded.window_started_at,sent_count=1,last_sent_at=excluded.last_sent_at').run(emailHash, purpose, now, now)
  } else {
    db.prepare('UPDATE auth_mail_limits SET sent_count=sent_count+1,last_sent_at=? WHERE email_hash=? AND purpose=?').run(now, emailHash, purpose)
  }
  return true
}
const sendAuthEmail = async ({ to, subject, text, html }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    console.error('Transactional email delivery failed:', response.status)
    throw new Error('Email delivery is temporarily unavailable. Try again in a few minutes.')
  }
}
const sendAuthLink = async (user, purpose) => {
  if (!emailConfigured) throw new Error('Email service is not configured yet. Please try again later.')
  if (!canSendAuthEmail(user.email, purpose)) return false
  const token = createAuthToken(user.id, purpose, purpose === 'verify-email' ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000)
  const isVerification = purpose === 'verify-email'
  const parameter = isVerification ? 'verify_email' : 'reset_password'
  const link = `${appOrigin.replace(/\/$/, '')}/?${parameter}=${token}`
  const action = isVerification ? 'Verify email address' : 'Reset password'
  const title = isVerification ? 'Verify your OzooNotes email' : 'Reset your OzooNotes password'
  const expiry = isVerification ? '24 hours' : '1 hour'
  await sendAuthEmail({
    to: user.email,
    subject: title,
    text: `${title}\n\nOpen this link to continue: ${link}\n\nThis link expires in ${expiry}. If you did not request this, you can ignore this email.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:32px auto;padding:28px;border:1px solid #e6e2ec;border-radius:14px;color:#211d2a"><p style="color:#6a35e8;font-weight:700;letter-spacing:.08em">OZOONOTES</p><h1 style="font-size:24px">${title}</h1><p>Use the button below to continue. This one-time link expires in ${expiry}.</p><p style="margin:28px 0"><a href="${link}" style="padding:13px 20px;border-radius:9px;background:#6a35e8;color:white;text-decoration:none;font-weight:700">${action}</a></p><p style="font-size:12px;color:#716b7c">If you did not request this, you can safely ignore this email.</p></div>`,
  })
  return true
}
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
  return db.prepare('SELECT users.id, users.username, users.email, COALESCE(users.display_name, users.username) AS displayName, users.avatar_data AS avatar, users.password_enabled AS hasPassword FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?').get(hash, Date.now()) ?? null
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
    if (route === '/api/auth/providers' && method === 'GET') return sendJson(res, 200, { google: googleEnabled, github: githubEnabled })
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
        const result = db.prepare('INSERT INTO users(username,salt,password_hash,google_sub,display_name,password_enabled) VALUES(?,?,?,?,?,0)').run(username, salt, hash, profile.sub, String(profile.name ?? username).trim().slice(0, 60))
        user = { id: Number(result.lastInsertRowid), username }
      }
      const sessionId = createSession(user.id)
      return res.writeHead(303, { Location: `${appOrigin.replace(/\/$/, '')}/`, 'Set-Cookie': [`${cookieName}=${sessionId}; ${cookieFlags}; Max-Age=2592000`, clearStateCookie], 'Cache-Control': 'no-store' }).end()
    }
    if (route === '/api/auth/github' && method === 'GET') {
      if (!githubEnabled) return sendJson(res, 503, { error: 'GitHub sign-in is not configured on this OzooNotes server yet.' })
      const now = Date.now()
      for (const [key, entry] of githubStates) if (entry.expiresAt <= now) githubStates.delete(key)
      const state = randomBytes(32).toString('hex')
      const browserBinding = randomBytes(32).toString('hex')
      githubStates.set(state, { browserBinding, expiresAt: now + 10 * 60 * 1000 })
      const authorization = new URL('https://github.com/login/oauth/authorize')
      authorization.search = new URLSearchParams({ client_id: process.env.GITHUB_CLIENT_ID, redirect_uri: githubRedirectUri, scope: 'read:user', state }).toString()
      return res.writeHead(302, { Location: authorization.toString(), 'Set-Cookie': `${githubStateCookie}=${browserBinding}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`, 'Cache-Control': 'no-store' }).end()
    }
    if (route === '/api/auth/github/callback' && method === 'GET') {
      if (!githubEnabled) return sendJson(res, 503, { error: 'GitHub sign-in is not configured on this OzooNotes server yet.' })
      const state = url.searchParams.get('state') ?? ''
      const stateEntry = githubStates.get(state)
      githubStates.delete(state)
      const cookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${githubStateCookie}=`))
      const browserBinding = cookie?.slice(githubStateCookie.length + 1)
      const clearStateCookie = `${githubStateCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`
      if (url.searchParams.has('error')) return sendJson(res, 400, { error: 'GitHub sign-in was cancelled.' }, { 'Set-Cookie': clearStateCookie })
      const code = url.searchParams.get('code')
      if (!stateEntry || stateEntry.expiresAt <= Date.now() || stateEntry.browserBinding !== browserBinding || !code) return sendJson(res, 400, { error: 'GitHub sign-in expired or could not be verified. Please try again.' }, { 'Set-Cookie': clearStateCookie })
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code, redirect_uri: githubRedirectUri }) })
      const token = await tokenResponse.json()
      if (!tokenResponse.ok || typeof token.access_token !== 'string') return sendJson(res, 401, { error: 'GitHub could not complete sign-in. Check the OAuth callback URL and try again.' }, { 'Set-Cookie': clearStateCookie })
      const profileResponse = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'OzooNotes' } })
      const profile = await profileResponse.json()
      if (!profileResponse.ok || (typeof profile.id !== 'number' && typeof profile.id !== 'string') || typeof profile.login !== 'string' || !profile.login) return sendJson(res, 401, { error: 'GitHub did not return a valid account.' }, { 'Set-Cookie': clearStateCookie })
      const githubId = String(profile.id)
      let user = db.prepare('SELECT id, username FROM users WHERE github_id = ?').get(githubId)
      if (!user) {
        const loginPrefix = String(profile.login).toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 24) || 'github_user'
        let username = loginPrefix
        while (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) username = `${loginPrefix.slice(0, 23)}_${randomBytes(3).toString('hex')}`
        const salt = randomBytes(16).toString('hex')
        const hash = randomBytes(64).toString('hex')
        const result = db.prepare('INSERT INTO users(username,salt,password_hash,github_id,display_name,password_enabled) VALUES(?,?,?,?,?,0)').run(username, salt, hash, githubId, String(profile.name ?? username).trim().slice(0, 60))
        user = { id: Number(result.lastInsertRowid), username }
      }
      const sessionId = createSession(user.id)
      return res.writeHead(303, { Location: `${appOrigin.replace(/\/$/, '')}/`, 'Set-Cookie': [`${cookieName}=${sessionId}; ${cookieFlags}; Max-Age=2592000`, clearStateCookie], 'Cache-Control': 'no-store' }).end()
    }
    if (route === '/api/auth/verify-email' && method === 'POST') {
      const { token } = await readBody(req, 10_000)
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return sendJson(res, 400, { error: 'That verification link is invalid or has expired.' })
      const tokenHash = sessionTokenHash(token)
      const record = db.prepare("SELECT user_id,expires_at FROM auth_tokens WHERE token_hash=? AND purpose='verify-email'").get(tokenHash)
      if (!record || record.expires_at <= Date.now()) {
        db.prepare('DELETE FROM auth_tokens WHERE token_hash=?').run(tokenHash)
        return sendJson(res, 400, { error: 'That verification link is invalid or has expired. Request a new one and try again.' })
      }
      db.prepare('UPDATE users SET email_verified_at=? WHERE id=?').run(Date.now(), record.user_id)
      db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='verify-email'").run(record.user_id)
      return sendJson(res, 200, { ok: true, message: 'Email verified. You can now sign in.' })
    }
    if (route === '/api/auth/resend-verification' && method === 'POST') {
      const { email } = await readBody(req, 10_000)
      const cleanEmail = String(email ?? '').trim().toLowerCase()
      if (!validEmail(cleanEmail)) return sendJson(res, 400, { error: 'Enter a valid email address.' })
      if (!emailConfigured) return sendJson(res, 503, { error: 'Email service is not configured yet. Please try again later.' })
      const user = db.prepare('SELECT id,email,email_verified_at FROM users WHERE email=?').get(cleanEmail)
      if (user && !user.email_verified_at) {
        try { await sendAuthLink(user, 'verify-email') } catch { /* Keep the response uniform so email addresses cannot be discovered. */ }
      }
      return sendJson(res, 200, { ok: true, message: 'If that address has an unverified OzooNotes account, a verification link will arrive shortly.' })
    }
    if (route === '/api/auth/password-reset/request' && method === 'POST') {
      const { email } = await readBody(req, 10_000)
      const cleanEmail = String(email ?? '').trim().toLowerCase()
      if (!validEmail(cleanEmail)) return sendJson(res, 400, { error: 'Enter a valid email address.' })
      if (!emailConfigured) return sendJson(res, 503, { error: 'Email service is not configured yet. Please try again later.' })
      const user = db.prepare('SELECT id,email,email_verified_at FROM users WHERE email=?').get(cleanEmail)
      if (user?.email_verified_at) {
        try { await sendAuthLink(user, 'reset-password') } catch { /* Keep the response uniform so email addresses cannot be discovered. */ }
      }
      return sendJson(res, 200, { ok: true, message: 'If that address belongs to a verified OzooNotes account, a password reset link will arrive shortly.' })
    }
    if (route === '/api/auth/password-reset/complete' && method === 'POST') {
      const { token, password } = await readBody(req, 10_000)
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return sendJson(res, 400, { error: 'That reset link is invalid or has expired.' })
      if (typeof password !== 'string' || password.length < 12 || password.length > 256) return sendJson(res, 400, { error: 'Use a password between 12 and 256 characters.' })
      const tokenHash = sessionTokenHash(token)
      const record = db.prepare("SELECT user_id,expires_at FROM auth_tokens WHERE token_hash=? AND purpose='reset-password'").get(tokenHash)
      if (!record || record.expires_at <= Date.now()) {
        db.prepare('DELETE FROM auth_tokens WHERE token_hash=?').run(tokenHash)
        return sendJson(res, 400, { error: 'That reset link is invalid or has expired. Request a new one and try again.' })
      }
      const salt = randomBytes(16).toString('hex')
      const hash = scryptSync(password, salt, 64).toString('hex')
      db.prepare('UPDATE users SET salt=?,password_hash=?,password_enabled=1 WHERE id=?').run(salt, hash, record.user_id)
      db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='reset-password'").run(record.user_id)
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(record.user_id)
      return sendJson(res, 200, { ok: true, message: 'Password updated. Sign in with your new password.' }, { 'Set-Cookie': `${cookieName}=; ${cookieFlags}; Max-Age=0` })
    }
    if (route === '/api/auth/register' && method === 'POST') {
      const { username, email, password } = await readBody(req)
      const cleanName = String(username ?? '').trim()
      const cleanEmail = String(email ?? '').trim().toLowerCase()
      if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(cleanName)) return sendJson(res, 400, { error: 'Use a 3–32 character username with letters, numbers, dots, underscores, or hyphens.' })
      if (!validEmail(cleanEmail)) return sendJson(res, 400, { error: 'Enter a valid email address.' })
      if (typeof password !== 'string' || password.length < 12 || password.length > 256) return sendJson(res, 400, { error: 'Use a password between 12 and 256 characters.' })
      if (!emailConfigured) return sendJson(res, 503, { error: 'Email verification is not configured yet. Please try again later.' })
      const salt = randomBytes(16).toString('hex')
      const hash = scryptSync(password, salt, 64).toString('hex')
      const result = db.prepare('INSERT INTO users(username,salt,password_hash,email) VALUES(?,?,?,?)').run(cleanName, salt, hash, cleanEmail)
      const user = { id: Number(result.lastInsertRowid), email: cleanEmail }
      try {
        const sent = await sendAuthLink(user, 'verify-email')
        if (!sent) return sendJson(res, 429, { error: 'Please wait a minute before requesting another verification email.' })
      } catch (error) { return sendJson(res, 503, { error: error instanceof Error ? error.message : 'Could not send the verification email.' }) }
      return sendJson(res, 201, { requiresVerification: true, message: 'Check your inbox for a verification link before signing in.' })
    }
    if (route === '/api/auth/login' && method === 'POST') {
      const { login, username, password } = await readBody(req)
      const identifier = String(login ?? username ?? '').trim()
      const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(identifier, identifier.toLowerCase())
      if (!user || typeof password !== 'string' || password.length > 256) return sendJson(res, 401, { error: 'Email/username or password is incorrect.' })
      const candidate = scryptSync(password, user.salt, 64)
      if (!timingSafeEqual(candidate, Buffer.from(user.password_hash, 'hex'))) return sendJson(res, 401, { error: 'Email/username or password is incorrect.' })
      if (user.email && !user.email_verified_at) return sendJson(res, 403, { error: 'Verify your email before signing in.', code: 'EMAIL_NOT_VERIFIED' })
      const sessionId = randomBytes(32).toString('hex')
      db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sessionTokenHash(sessionId), user.id, Date.now() + 30 * 24 * 60 * 60 * 1000)
      return sendJson(res, 200, { user: db.prepare('SELECT id,username,email,COALESCE(display_name,username) AS displayName,avatar_data AS avatar,password_enabled AS hasPassword FROM users WHERE id=?').get(user.id) }, { 'Set-Cookie': `${cookieName}=${sessionId}; ${cookieFlags}` })
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
    if (route === '/api/me/profile' && method === 'PUT') {
      const { displayName, avatar } = await readBody(req, 2 * 1024 * 1024)
      const cleanName = String(displayName ?? '').trim()
      if (!cleanName || cleanName.length > 60) return sendJson(res, 400, { error: 'Choose a display name from 1 to 60 characters.' })
      if (avatar !== null && avatar !== undefined && (typeof avatar !== 'string' || !/^data:image\\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar) || avatar.length > 1_800_000)) return sendJson(res, 400, { error: 'Use a PNG, JPEG, or WebP profile photo under 1.3 MB.' })
      db.prepare('UPDATE users SET display_name=?,avatar_data=? WHERE id=?').run(cleanName, avatar || null, user.id)
      const updated = db.prepare('SELECT id,username,email,COALESCE(display_name,username) AS displayName,avatar_data AS avatar,password_enabled AS hasPassword FROM users WHERE id=?').get(user.id)
      return sendJson(res, 200, { user: updated })
    }
    if (route === '/api/me/password' && method === 'POST') {
      const { currentPassword, newPassword } = await readBody(req, 10_000)
      if (typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 256) return sendJson(res, 400, { error: 'Use a new password between 12 and 256 characters.' })
      const stored = db.prepare('SELECT salt,password_hash,password_enabled FROM users WHERE id=?').get(user.id)
      if (!stored.password_enabled) return sendJson(res, 400, { error: 'This account uses Google or GitHub sign-in. Manage its password with that provider.' })
      if (typeof currentPassword !== 'string') return sendJson(res, 400, { error: 'Enter your current password.' })
      const candidate = scryptSync(currentPassword, stored.salt, 64)
      if (!timingSafeEqual(candidate, Buffer.from(stored.password_hash, 'hex'))) return sendJson(res, 401, { error: 'Your current password is incorrect.' })
      const salt = randomBytes(16).toString('hex')
      const hash = scryptSync(newPassword, salt, 64).toString('hex')
      const sessionCookie = req.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${cookieName}=`))
      const currentSessionHash = sessionCookie ? sessionTokenHash(sessionCookie.slice(cookieName.length + 1)) : ''
      db.prepare('UPDATE users SET salt=?,password_hash=? WHERE id=?').run(salt, hash, user.id)
      db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(user.id, currentSessionHash)
      return sendJson(res, 200, { ok: true })
    }

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
    return sendJson(res, status, { error: status === 409 ? 'That username, email, or folder already exists.' : message })
  }
}

createServer((req, res) => { void handler(req, res) }).listen(port, host, () => console.log(`OzooNotes server listening at http://${host}:${port}`))


