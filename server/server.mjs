import { createServer } from 'node:http'
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const port = Number(process.env.PORT ?? 8787)
const host = process.env.HOST ?? '0.0.0.0'
const databasePath = process.env.DOOMNOTES_DB ?? join(process.cwd(), 'data', 'doomnotes.sqlite')
const staticRoot = resolve(process.cwd(), 'dist')
const dataEncryptionKey = process.env.OZOO_DATA_ENCRYPTION_KEY ? Buffer.from(process.env.OZOO_DATA_ENCRYPTION_KEY, 'base64') : null
const encryptedValuePrefix = 'ozoo:aes-256-gcm:v1:'
const dashboardOptionIds = new Set(['projects', 'simulation', 'infiniteBoard', 'diary', 'roadmaps', 'resources', 'books', 'watchlist'])
if (dataEncryptionKey && dataEncryptionKey.length !== 32) throw new Error('OZOO_DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.')
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
  CREATE TABLE IF NOT EXISTS roadmaps (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, summary TEXT NOT NULL, category TEXT NOT NULL, tags_json TEXT NOT NULL, content_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS resource_collections (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, summary TEXT NOT NULL, category TEXT NOT NULL, tags_json TEXT NOT NULL, videos_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS resource_videos (id TEXT PRIMARY KEY, collection_id INTEGER NOT NULL REFERENCES resource_collections(id) ON DELETE CASCADE, filename TEXT NOT NULL, media_type TEXT NOT NULL, data_text TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS teacher_students (teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')), permission TEXT NOT NULL DEFAULT 'view' CHECK(permission IN ('view','edit')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(teacher_id,student_id), CHECK(teacher_id<>student_id));
  CREATE INDEX IF NOT EXISTS roadmaps_updated_at_idx ON roadmaps(updated_at DESC);
  CREATE INDEX IF NOT EXISTS resource_collections_updated_at_idx ON resource_collections(updated_at DESC);
`)
const accessColumns = db.prepare('PRAGMA table_info(board_access)').all().map((column) => column.name)
if (!accessColumns.includes('can_download')) db.exec('ALTER TABLE board_access ADD COLUMN can_download INTEGER NOT NULL DEFAULT 0')
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
if (!userColumns.includes('plan')) db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'normal' CHECK(plan IN ('normal','pro'))")
if (!userColumns.includes('account_type')) db.exec("ALTER TABLE users ADD COLUMN account_type TEXT NOT NULL DEFAULT 'student' CHECK(account_type IN ('student','teacher','business','employee'))")
if (!userColumns.includes('business_plan')) db.exec('ALTER TABLE users ADD COLUMN business_plan INTEGER NOT NULL DEFAULT 0 CHECK(business_plan IN (0,1))')
if (!userColumns.includes('dashboard_options')) db.exec('ALTER TABLE users ADD COLUMN dashboard_options TEXT')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique ON users(google_sub) WHERE google_sub IS NOT NULL')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_github_id_unique ON users(github_id) WHERE github_id IS NOT NULL')
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(email) WHERE email IS NOT NULL')

const encryptAtRest = (value) => {
  if (!dataEncryptionKey || value.startsWith(encryptedValuePrefix)) return value
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', dataEncryptionKey, iv)
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${encryptedValuePrefix}${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`
}
const decryptAtRest = (value) => {
  if (!value.startsWith(encryptedValuePrefix)) return value
  if (!dataEncryptionKey) throw new Error('OZOO_DATA_ENCRYPTION_KEY is required to read encrypted cloud data.')
  const [ivText, tagText, ciphertextText] = value.slice(encryptedValuePrefix.length).split(':')
  if (!ivText || !tagText || !ciphertextText) throw new Error('Stored encrypted data is invalid.')
  const decipher = createDecipheriv('aes-256-gcm', dataEncryptionKey, Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8')
}

db.exec('CREATE TABLE IF NOT EXISTS app_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
const savedEncryptionKeyId = db.prepare("SELECT value FROM app_metadata WHERE key='data_encryption_key_id'").get()?.value
const encryptionKeyId = dataEncryptionKey ? createHash('sha256').update(dataEncryptionKey).digest('hex') : null
if (savedEncryptionKeyId && savedEncryptionKeyId !== encryptionKeyId) {
  throw new Error('The encryption key is missing or has changed. Restore the original OZOO_DATA_ENCRYPTION_KEY to access saved cloud content.')
}
if (dataEncryptionKey && !savedEncryptionKeyId) {
  db.exec('PRAGMA secure_delete = ON; BEGIN IMMEDIATE')
  try {
    for (const row of db.prepare('SELECT id,state_json FROM boards').all()) {
      const plainState = decryptAtRest(row.state_json)
      db.prepare('UPDATE boards SET state_json=? WHERE id=?').run(encryptAtRest(plainState), row.id)
    }
    for (const row of db.prepare('SELECT id,body FROM comments').all()) {
      const plainBody = decryptAtRest(row.body)
      db.prepare('UPDATE comments SET body=? WHERE id=?').run(encryptAtRest(plainBody), row.id)
    }
    db.prepare("INSERT INTO app_metadata(key,value) VALUES('data_encryption_key_id',?)").run(encryptionKeyId)
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM; PRAGMA wal_checkpoint(TRUNCATE)')
}

db.exec('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL)')
db.exec(`CREATE TABLE IF NOT EXISTS user_data (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, data_key TEXT NOT NULL, data_value TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)), updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,data_key))`)
db.exec('CREATE INDEX IF NOT EXISTS user_data_updated_at_idx ON user_data(user_id,updated_at)')
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
const adminUsernames = new Set((process.env.ADMIN_USERNAMES ?? '').split(',').map((name) => name.trim().toLowerCase()).filter(Boolean))
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
  const user = db.prepare('SELECT users.id, users.username, users.email, COALESCE(users.display_name, users.username) AS displayName, users.avatar_data AS avatar, users.password_enabled AS hasPassword, users.plan, users.business_plan AS businessPlan, users.account_type AS accountType, users.dashboard_options AS dashboardOptionsJson FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?').get(hash, Date.now())
  if (!user) return null
  let dashboardOptions = null
  if (user.dashboardOptionsJson !== null) {
    try {
      const stored = JSON.parse(user.dashboardOptionsJson)
      if (Array.isArray(stored) && stored.every((option) => typeof option === 'string' && dashboardOptionIds.has(option))) dashboardOptions = [...new Set(stored)]
    } catch { /* Invalid saved preferences are treated as not configured yet. */ }
  }
  const { dashboardOptionsJson, ...profile } = user
  return { ...profile, dashboardOptions, isAdmin: adminUsernames.has(String(user.username).toLowerCase()) }
}
const notifyBoard = (boardId, type) => {
  for (const client of eventClients.get(boardId) ?? []) client.write(`event: ${type}\ndata: {}\n\n`)
}
const roadmapSummary = (row, viewerId = null) => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  category: row.category,
  tags: JSON.parse(row.tags_json),
  author: db.prepare('SELECT username FROM users WHERE id=?').get(row.owner_id)?.username ?? 'OzooNotes member',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isOwner: viewerId === row.owner_id,
})
const resourceSummary = (row, viewerId = null) => ({
  id: row.id,
  title: row.title,
  summary: row.summary,
  category: row.category,
  tags: JSON.parse(row.tags_json),
  videos: JSON.parse(row.videos_json).map(({ id, title, description, kind, url, mediaType, filename }) => ({ id, title, description, kind, url, mediaType, filename })),
  author: db.prepare('SELECT username FROM users WHERE id=?').get(row.owner_id)?.username ?? 'OzooNotes member',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  isOwner: viewerId === row.owner_id,
})
const normalizeRoadmapContent = (content) => {
  if (!Array.isArray(content) || content.length < 1 || content.length > 100) throw new Error('A roadmap needs 1–100 content blocks.')
  const allowedKinds = new Set(['step', 'text', 'image', 'link', 'video', 'map'])
  return content.map((block) => {
    if (!block || typeof block !== 'object' || !allowedKinds.has(block.kind)) throw new Error('A roadmap contains an unsupported content block.')
    const clean = { id: String(block.id ?? randomBytes(8).toString('hex')).slice(0, 80), kind: block.kind }
    if (block.title !== undefined) clean.title = String(block.title).slice(0, 160)
    if (block.body !== undefined) clean.body = String(block.body).slice(0, 20_000)
    if (block.kind === 'map') {
      if (!Array.isArray(block.nodes) || block.nodes.length < 1 || block.nodes.length > 100) throw new Error('A concept map needs 1–100 objects.')
      const validShapes = new Set(['rounded', 'circle', 'diamond', 'pill', 'hexagon'])
      const validColors = new Set(['#ffe49b', '#b8d8ff', '#baf0d1', '#d9c3ff', '#ffc4cd', '#ffd0a3', '#aee8e8', '#eeeeef'])
      clean.nodes = block.nodes.map((node) => {
        if (!node || typeof node !== 'object' || !validShapes.has(node.shape) || !validColors.has(node.color)) throw new Error('Concept map objects need a supported shape and color.')
        return { id: String(node.id ?? randomBytes(8).toString('hex')).slice(0, 80), label: String(node.label ?? 'Idea').trim().slice(0, 40) || 'Idea', description: String(node.description ?? '').slice(0, 500), shape: node.shape, color: node.color, x: Math.max(90, Math.min(910, Number(node.x) || 500)), y: Math.max(50, Math.min(550, Number(node.y) || 300)) }
      })
      const nodeIds = new Set(clean.nodes.map((node) => node.id))
      if (!Array.isArray(block.connections) || block.connections.length > 200) throw new Error('Concept map connections must not exceed 200.')
      clean.connections = block.connections.map((connection) => {
        const from = String(connection?.from ?? '')
        const to = String(connection?.to ?? '')
        if (!nodeIds.has(from) || !nodeIds.has(to) || from === to) throw new Error('A concept map connection must link two different objects.')
        return { id: String(connection.id ?? randomBytes(8).toString('hex')).slice(0, 80), from, to }
      })
    }
    if (block.kind === 'image') {
      const image = String(block.url ?? '')
      if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(image) || image.length > 5_600_000) throw new Error('Roadmap images must be PNG, JPEG, WebP, or GIF and under 4 MB.')
      clean.url = image
      clean.mediaType = String(block.mediaType ?? '').slice(0, 40)
    } else if (block.kind === 'link' || block.kind === 'video') {
      let url
      try { url = new URL(String(block.url ?? '')) } catch { throw new Error('Add a valid link or video URL.') }
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Links must use HTTP or HTTPS.')
      clean.url = url.toString()
    }
    return clean
  })
}
const boardRole = (boardId, userId) => {
  const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId)
  if (!board) return null
  if (board.owner_id === userId) return { board, role: 'owner', canDownload: true }
  const access = db.prepare('SELECT role,can_download FROM board_access WHERE board_id = ? AND user_id = ?').get(boardId, userId)
  const teamAccess = db.prepare('SELECT tba.role FROM team_board_access tba JOIN team_members tm ON tm.team_id=tba.team_id WHERE tba.board_id=? AND tm.user_id=? ORDER BY CASE tba.role WHEN \'edit\' THEN 0 ELSE 1 END LIMIT 1').get(boardId, userId)
  const classroomAccess = db.prepare("SELECT ts.permission AS role FROM teacher_students ts JOIN users teacher ON teacher.id=ts.teacher_id WHERE ts.student_id=? AND ts.teacher_id=? AND ts.status='accepted' AND teacher.account_type='teacher'").get(board.owner_id, userId)
  const role = access?.role === 'edit' || teamAccess?.role === 'edit' || classroomAccess?.role === 'edit' ? 'edit' : access?.role ?? teamAccess?.role ?? classroomAccess?.role
  return role ? { board, role, canDownload: Boolean(access?.can_download) } : null
}
const shapeBoard = (row) => ({ id: row.id, ownerId: row.owner_id, ownerName: db.prepare('SELECT username FROM users WHERE id = ?').get(row.owner_id)?.username, folderId: row.folder_id, name: row.name, state: JSON.parse(decryptAtRest(row.state_json)), updatedAt: row.updated_at })
const normalizeBoardName = (name) => String(name ?? '').trim().normalize('NFKC').toLowerCase()
const boardNameConflict = (ownerId, name, exceptId = null) => db.prepare('SELECT id,name FROM boards WHERE owner_id=?').all(ownerId)
  .some((board) => board.id !== exceptId && normalizeBoardName(board.name) === normalizeBoardName(name))

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
    if (route === '/api/health') return sendJson(res, 200, { ok: true, cloudContentEncryptedAtRest: Boolean(dataEncryptionKey) })
    if (route === '/api/roadmaps' && method === 'GET') {
      const search = String(url.searchParams.get('q') ?? '').trim().slice(0, 100).toLowerCase()
      const category = String(url.searchParams.get('category') ?? '').trim().slice(0, 60)
      const rows = db.prepare('SELECT * FROM roadmaps ORDER BY updated_at DESC, id DESC LIMIT 300').all()
      const visible = rows.filter((row) => {
        if (category && row.category !== category) return false
        if (!search) return true
        return `${row.title} ${row.summary} ${row.category} ${row.tags_json}`.toLowerCase().includes(search)
      }).slice(0, 100)
      const viewer = sessionUser(req)
      const categories = db.prepare('SELECT DISTINCT category FROM roadmaps ORDER BY category COLLATE NOCASE').all().map((row) => row.category)
      return sendJson(res, 200, { roadmaps: visible.map((row) => roadmapSummary(row, viewer?.id ?? null)), categories })
    }
    if (route === '/api/resources' && method === 'GET') {
      const search = String(url.searchParams.get('q') ?? '').trim().slice(0, 100).toLowerCase()
      const category = String(url.searchParams.get('category') ?? '').trim().slice(0, 60)
      const rows = db.prepare('SELECT * FROM resource_collections ORDER BY updated_at DESC, id DESC LIMIT 300').all()
      const visible = rows.filter((row) => {
        if (category && row.category !== category) return false
        return !search || `${row.title} ${row.summary} ${row.category} ${row.tags_json} ${row.videos_json}`.toLowerCase().includes(search)
      }).slice(0, 100)
      const viewer = sessionUser(req)
      const categories = db.prepare('SELECT DISTINCT category FROM resource_collections ORDER BY category COLLATE NOCASE').all().map((row) => row.category)
      return sendJson(res, 200, { collections: visible.map((row) => resourceSummary(row, viewer?.id ?? null)), categories })
    }
    const resourceVideoRoute = route.match(/^\/api\/resources\/(\d+)\/videos\/([a-f0-9]{24})$/)
    if (resourceVideoRoute && method === 'GET') {
      const asset = db.prepare('SELECT v.filename,v.media_type AS mediaType,v.data_text AS data FROM resource_videos v JOIN resource_collections c ON c.id=v.collection_id WHERE c.id=? AND v.id=?').get(Number(resourceVideoRoute[1]), resourceVideoRoute[2])
      if (!asset) return sendJson(res, 404, { error: 'That video could not be found.' })
      const bytes = Buffer.from(decryptAtRest(asset.data), 'base64')
      const headers = { 'Content-Type': asset.mediaType, 'Content-Disposition': `inline; filename="${String(asset.filename).replace(/["\\\r\n]/g, '_')}"`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }
      const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/)
      if (range) {
        const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]))
        const end = range[2] ? Math.min(bytes.length - 1, Number(range[2])) : bytes.length - 1
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }).end(); return }
        res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${bytes.length}` }).end(bytes.subarray(start, end + 1))
        return
      }
      res.writeHead(200, { ...headers, 'Content-Length': bytes.length }).end(bytes)
      return
    }
    const resourceRoute = route.match(/^\/api\/resources\/(\d+)$/)
    if (resourceRoute && method === 'GET') {
      const row = db.prepare('SELECT * FROM resource_collections WHERE id=?').get(Number(resourceRoute[1]))
      if (!row) return sendJson(res, 404, { error: 'That resource collection could not be found.' })
      const viewer = sessionUser(req)
      return sendJson(res, 200, { collection: resourceSummary(row, viewer?.id ?? null) })
    }
    const roadmapRoute = route.match(/^\/api\/roadmaps\/(\d+)$/)
    if (roadmapRoute && method === 'GET') {
      const row = db.prepare('SELECT * FROM roadmaps WHERE id=?').get(Number(roadmapRoute[1]))
      if (!row) return sendJson(res, 404, { error: 'That roadmap could not be found.' })
      const viewer = sessionUser(req)
      const nextUpdateAt = row.owner_id === viewer?.id ? new Date(new Date(row.updated_at.replace(' ', 'T') + (row.updated_at.includes('Z') ? '' : 'Z')).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() : null
      return sendJson(res, 200, { roadmap: { ...roadmapSummary(row, viewer?.id ?? null), content: JSON.parse(decryptAtRest(row.content_json)), nextUpdateAt } })
    }
    if (route === '/api/auth/providers' && method === 'GET') return sendJson(res, 200, { google: googleEnabled, github: githubEnabled })
    if (route === '/api/auth/google' && method === 'GET') {
      if (!googleEnabled) return sendJson(res, 503, { error: 'Google sign-in is not configured on this OzooNotes server yet.' })
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
      const loggedInUser = db.prepare('SELECT id,username,email,COALESCE(display_name,username) AS displayName,avatar_data AS avatar,password_enabled AS hasPassword,plan,business_plan AS businessPlan,account_type AS accountType,dashboard_options AS dashboardOptionsJson FROM users WHERE id=?').get(user.id)
      let dashboardOptions = null
      if (loggedInUser.dashboardOptionsJson !== null) { try { const stored = JSON.parse(loggedInUser.dashboardOptionsJson); if (Array.isArray(stored) && stored.every((option) => typeof option === 'string' && dashboardOptionIds.has(option))) dashboardOptions = [...new Set(stored)] } catch { /* Invalid saved preferences are treated as not configured yet. */ } }
      const { dashboardOptionsJson, ...profile } = loggedInUser
      return sendJson(res, 200, { user: { ...profile, dashboardOptions, isAdmin: adminUsernames.has(String(profile.username).toLowerCase()) } }, { 'Set-Cookie': `${cookieName}=${sessionId}; ${cookieFlags}` })
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
    if (route === '/api/me/data' && method === 'GET') {
      const key = url.searchParams.get('key')
      const sinceValue = Number(url.searchParams.get('since') ?? 0)
      if (key !== null && (key.length > 240 || !/^(doomnotes:|ozoo:)(?!password-reset-token|after-login|dashboard-options-return|simulator-usage|cloud-sync)/.test(key) || key === 'doomnotes:cloud-board-ids')) return sendJson(res, 400, { error: 'That data key cannot be synced.' })
      const rows = key !== null
        ? db.prepare('SELECT data_key AS key,data_value AS value,deleted,updated_at AS updatedAt FROM user_data WHERE user_id=? AND data_key=?').all(user.id, key)
        : db.prepare('SELECT data_key AS key,data_value AS value,deleted,updated_at AS updatedAt FROM user_data WHERE user_id=? AND updated_at>? ORDER BY updated_at').all(user.id, Number.isFinite(sinceValue) && sinceValue > 0 ? sinceValue : 0)
      return sendJson(res, 200, { entries: rows.map((row) => ({ ...row, value: row.deleted ? null : decryptAtRest(row.value), deleted: Boolean(row.deleted) })) })
    }
    if (route === '/api/me/data' && method === 'PUT') {
      const { entries } = await readBody(req, 60 * 1024 * 1024)
      if (!Array.isArray(entries) || entries.length > 250) return sendJson(res, 400, { error: 'Sync this data in smaller batches.' })
      const saveEntry = db.prepare(`INSERT INTO user_data(user_id,data_key,data_value,deleted,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,data_key) DO UPDATE SET data_value=excluded.data_value,deleted=excluded.deleted,updated_at=max(user_data.updated_at+1,excluded.updated_at)`)
      const seen = new Set()
      const now = Date.now()
      const latestUpdate = db.prepare('SELECT COALESCE(MAX(updated_at),0) AS value FROM user_data WHERE user_id=?').get(user.id)?.value ?? 0
      let nextUpdatedAt = Math.max(now, Number(latestUpdate) + 1)
      for (const entry of entries) {
        if (!entry || typeof entry.key !== 'string' || entry.key.length > 240 || !/^(doomnotes:|ozoo:)(?!password-reset-token|after-login|dashboard-options-return|simulator-usage|cloud-sync)/.test(entry.key) || entry.key === 'doomnotes:cloud-board-ids' || seen.has(entry.key) || (entry.value !== null && (typeof entry.value !== 'string' || Buffer.byteLength(entry.value, 'utf8') > 20 * 1024 * 1024))) return sendJson(res, 400, { error: 'One or more items cannot be synced. Large files may need to be saved separately.' })
        seen.add(entry.key)
        saveEntry.run(user.id, entry.key, entry.value === null ? '' : encryptAtRest(entry.value), entry.value === null ? 1 : 0, nextUpdatedAt++)
      }
      const keys = [...seen]
      const saved = keys.length ? db.prepare(`SELECT data_key AS key,deleted,updated_at AS updatedAt FROM user_data WHERE user_id=? AND data_key IN (${keys.map(() => '?').join(',')})`).all(user.id, ...keys) : []
      return sendJson(res, 200, { entries: saved.map((row) => ({ ...row, deleted: Boolean(row.deleted) })) })
    }
    if (route === '/api/me/dashboard-options' && method === 'PUT') {
      const { options } = await readBody(req, 10_000)
      if (!Array.isArray(options) || options.length > dashboardOptionIds.size || options.some((option) => typeof option !== 'string' || !dashboardOptionIds.has(option)) || new Set(options).size !== options.length) return sendJson(res, 400, { error: 'Choose valid dashboard tools and try again.' })
      const dashboardOptions = [...options]
      db.prepare('UPDATE users SET dashboard_options=? WHERE id=?').run(JSON.stringify(dashboardOptions), user.id)
      return sendJson(res, 200, { dashboardOptions })
    }
    if (route === '/api/classroom/links' && method === 'GET') {
      const accountType = db.prepare('SELECT account_type FROM users WHERE id=?').get(user.id)?.account_type
      if (accountType === 'teacher') {
        const links = db.prepare('SELECT ts.student_id AS userId,u.username,ts.permission,ts.status FROM teacher_students ts JOIN users u ON u.id=ts.student_id WHERE ts.teacher_id=? ORDER BY ts.created_at DESC').all(user.id)
        return sendJson(res, 200, { links })
      }
      if (accountType === 'student') {
        const links = db.prepare('SELECT ts.teacher_id AS userId,u.username,ts.permission,ts.status FROM teacher_students ts JOIN users u ON u.id=ts.teacher_id WHERE ts.student_id=? ORDER BY ts.created_at DESC').all(user.id)
        return sendJson(res, 200, { links })
      }
      return sendJson(res, 403, { error: 'Classroom access is available for student and teacher accounts.' })
    }
    if (route === '/api/classroom/links' && method === 'POST') {
      const accountType = db.prepare('SELECT account_type FROM users WHERE id=?').get(user.id)?.account_type
      if (accountType !== 'teacher') return sendJson(res, 403, { error: 'Only teacher accounts can invite students.' })
      const { username, permission } = await readBody(req, 5_000)
      if (!['view','edit'].includes(permission)) return sendJson(res, 400, { error: 'Choose view or edit access.' })
      const student = db.prepare("SELECT id FROM users WHERE username=? AND account_type='student'").get(String(username ?? '').trim())
      if (!student) return sendJson(res, 404, { error: 'No student account with that username was found.' })
      if (student.id === user.id) return sendJson(res, 400, { error: 'You cannot invite your own account.' })
      db.prepare("INSERT INTO teacher_students(teacher_id,student_id,status,permission) VALUES(?,?,'pending',?) ON CONFLICT(teacher_id,student_id) DO UPDATE SET status='pending',permission=excluded.permission,created_at=CURRENT_TIMESTAMP").run(user.id, student.id, permission)
      return sendJson(res, 201, { ok: true })
    }
    const classroomLink = route.match(/^\/api\/classroom\/links\/(\d+)$/)
    if (classroomLink && method === 'PATCH') {
      const accountType = db.prepare('SELECT account_type FROM users WHERE id=?').get(user.id)?.account_type
      const { status } = await readBody(req, 5_000)
      if (accountType !== 'student' || !['accepted','declined'].includes(status)) return sendJson(res, 403, { error: 'Only a student can accept or decline a teacher invitation.' })
      const result = db.prepare("UPDATE teacher_students SET status=? WHERE teacher_id=? AND student_id=? AND status='pending'").run(status, Number(classroomLink[1]), user.id)
      return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'That pending invitation could not be found.' })
    }
    if (classroomLink && method === 'DELETE') {
      const otherUserId = Number(classroomLink[1])
      const result = db.prepare('DELETE FROM teacher_students WHERE (teacher_id=? AND student_id=?) OR (teacher_id=? AND student_id=?)').run(user.id, otherUserId, otherUserId, user.id)
      return result.changes ? sendJson(res, 200, { ok: true }) : sendJson(res, 404, { error: 'That classroom connection could not be found.' })
    }
    if (route === '/api/roadmaps' && method === 'POST') {
      const { title, summary, category, tags, content } = await readBody(req, 12 * 1024 * 1024)
      const cleanTitle = String(title ?? '').trim().slice(0, 120)
      const cleanSummary = String(summary ?? '').trim().slice(0, 500)
      const cleanCategory = String(category ?? 'General').trim().slice(0, 60) || 'General'
      const cleanTags = Array.isArray(tags) ? [...new Set(tags.map((tag) => String(tag).trim().slice(0, 32)).filter(Boolean))].slice(0, 12) : []
      if (!cleanTitle || !cleanSummary) return sendJson(res, 400, { error: 'Add a title and short description for your roadmap.' })
      const cleanContent = normalizeRoadmapContent(content)
      const contentJson = JSON.stringify(cleanContent)
      if (Buffer.byteLength(contentJson, 'utf8') > 10 * 1024 * 1024) return sendJson(res, 413, { error: 'Roadmap content must be under 10 MB.' })
      const result = db.prepare('INSERT INTO roadmaps(owner_id,title,summary,category,tags_json,content_json) VALUES(?,?,?,?,?,?)').run(user.id, cleanTitle, cleanSummary, cleanCategory, JSON.stringify(cleanTags), encryptAtRest(contentJson))
      const row = db.prepare('SELECT * FROM roadmaps WHERE id=?').get(Number(result.lastInsertRowid))
      return sendJson(res, 201, { roadmap: { ...roadmapSummary(row, user.id), content: cleanContent, nextUpdateAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() } })
    }
    if (route === '/api/resources' && method === 'POST') {
      const { title, summary, category, tags, videos } = await readBody(req, 40 * 1024 * 1024)
      const cleanTitle = String(title ?? '').trim().slice(0, 120)
      const cleanSummary = String(summary ?? '').trim().slice(0, 500)
      const cleanCategory = String(category ?? 'General').trim().slice(0, 60) || 'General'
      const cleanTags = Array.isArray(tags) ? [...new Set(tags.map((tag) => String(tag).trim().slice(0, 32)).filter(Boolean))].slice(0, 12) : []
      if (!cleanTitle || !cleanSummary) return sendJson(res, 400, { error: 'Add a collection title and a short description.' })
      if (!Array.isArray(videos) || videos.length < 1 || videos.length > 30) return sendJson(res, 400, { error: 'Add between 1 and 30 videos to a collection.' })
      let uploadBytes = 0
      const videoRows = videos.map((video) => {
        if (!video || typeof video !== 'object') throw new Error('A video entry is invalid.')
        const id = randomBytes(12).toString('hex')
        const clean = { id, title: String(video.title ?? '').trim().slice(0, 140), description: String(video.description ?? '').trim().slice(0, 500), kind: video.kind === 'upload' ? 'upload' : 'link' }
        if (!clean.title) throw new Error('Give every video a title.')
        if (clean.kind === 'upload') {
          const mediaType = String(video.mediaType ?? '')
          const filename = String(video.filename ?? 'video').slice(0, 180).replace(/[\r\n]/g, '_')
          const data = String(video.data ?? '')
          if (!['video/mp4','video/webm','video/ogg'].includes(mediaType) || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Video uploads must be MP4, WebM, or Ogg files.')
          const size = Buffer.from(data, 'base64').length
          if (!size || size > 15 * 1024 * 1024) throw new Error('Each uploaded video must be under 15 MB.')
          uploadBytes += size
          if (uploadBytes > 25 * 1024 * 1024) throw new Error('Uploaded videos in one collection must total under 25 MB.')
          clean.mediaType = mediaType
          clean.filename = filename
          clean.data = data
        } else {
          let videoUrl
          try { videoUrl = new URL(String(video.url ?? '')) } catch { throw new Error('Add a valid video link.') }
          if (!['http:','https:'].includes(videoUrl.protocol)) throw new Error('Video links must use HTTP or HTTPS.')
          clean.url = videoUrl.toString()
        }
        return clean
      })
      const videosJson = JSON.stringify(videoRows.map(({ data, ...video }) => video))
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = db.prepare('INSERT INTO resource_collections(owner_id,title,summary,category,tags_json,videos_json) VALUES(?,?,?,?,?,?)').run(user.id, cleanTitle, cleanSummary, cleanCategory, JSON.stringify(cleanTags), videosJson)
        const collectionId = Number(result.lastInsertRowid)
        const addVideo = db.prepare('INSERT INTO resource_videos(id,collection_id,filename,media_type,data_text) VALUES(?,?,?,?,?)')
        for (const video of videoRows) if (video.kind === 'upload') addVideo.run(video.id, collectionId, video.filename, video.mediaType, encryptAtRest(video.data))
        db.exec('COMMIT')
        const row = db.prepare('SELECT * FROM resource_collections WHERE id=?').get(collectionId)
        return sendJson(res, 201, { collection: resourceSummary(row, user.id) })
      } catch (error) { db.exec('ROLLBACK'); throw error }
    }
    const resourceEditRoute = route.match(/^\/api\/resources\/(\d+)$/)
    if (resourceEditRoute && (method === 'PUT' || method === 'DELETE')) {
      const id = Number(resourceEditRoute[1])
      const row = db.prepare('SELECT * FROM resource_collections WHERE id=?').get(id)
      if (!row) return sendJson(res, 404, { error: 'That resource collection could not be found.' })
      if (row.owner_id !== user.id) return sendJson(res, 403, { error: 'Only the collection owner can change it.' })
      if (method === 'DELETE') { db.prepare('DELETE FROM resource_collections WHERE id=?').run(id); return sendJson(res, 200, { ok: true }) }
      const { title, summary, category, tags, videos } = await readBody(req, 40 * 1024 * 1024)
      const cleanTitle = String(title ?? '').trim().slice(0, 120)
      const cleanSummary = String(summary ?? '').trim().slice(0, 500)
      const cleanCategory = String(category ?? 'General').trim().slice(0, 60) || 'General'
      const cleanTags = Array.isArray(tags) ? [...new Set(tags.map((tag) => String(tag).trim().slice(0, 32)).filter(Boolean))].slice(0, 12) : []
      if (!cleanTitle || !cleanSummary) return sendJson(res, 400, { error: 'Add a collection title and a short description.' })
      if (!Array.isArray(videos) || videos.length < 1 || videos.length > 30) return sendJson(res, 400, { error: 'Add between 1 and 30 videos to a collection.' })
      let uploadBytes = 0
      const videoRows = videos.map((video) => {
        if (!video || typeof video !== 'object') throw new Error('A video entry is invalid.')
        const videoId = /^[a-f0-9]{24}$/.test(String(video.id ?? '')) ? String(video.id) : randomBytes(12).toString('hex')
        const clean = { id: videoId, title: String(video.title ?? '').trim().slice(0, 140), description: String(video.description ?? '').trim().slice(0, 500), kind: video.kind === 'upload' ? 'upload' : 'link' }
        if (!clean.title) throw new Error('Give every video a title.')
        if (clean.kind === 'upload') {
          const existing = db.prepare('SELECT filename,media_type AS mediaType FROM resource_videos WHERE id=? AND collection_id=?').get(videoId, id)
          if (existing && !video.data) { clean.filename = existing.filename; clean.mediaType = existing.mediaType }
          else {
            const mediaType = String(video.mediaType ?? '')
            const filename = String(video.filename ?? 'video').slice(0, 180).replace(/[\r\n]/g, '_')
            const data = String(video.data ?? '')
            if (!['video/mp4','video/webm','video/ogg'].includes(mediaType) || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('Video uploads must be MP4, WebM, or Ogg files.')
            const size = Buffer.from(data, 'base64').length
            if (!size || size > 15 * 1024 * 1024) throw new Error('Each uploaded video must be under 15 MB.')
            uploadBytes += size
            if (uploadBytes > 25 * 1024 * 1024) throw new Error('Uploaded videos in one collection must total under 25 MB.')
            clean.filename = filename; clean.mediaType = mediaType; clean.data = data
          }
        } else {
          let videoUrl
          try { videoUrl = new URL(String(video.url ?? '')) } catch { throw new Error('Add a valid video link.') }
          if (!['http:','https:'].includes(videoUrl.protocol)) throw new Error('Video links must use HTTP or HTTPS.')
          clean.url = videoUrl.toString()
        }
        return clean
      })
      const videosJson = JSON.stringify(videoRows.map(({ data, ...video }) => video))
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare("UPDATE resource_collections SET title=?,summary=?,category=?,tags_json=?,videos_json=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(cleanTitle, cleanSummary, cleanCategory, JSON.stringify(cleanTags), videosJson, id)
        const keep = videoRows.filter((video) => video.kind === 'upload').map((video) => video.id)
        const existingVideos = db.prepare('SELECT id FROM resource_videos WHERE collection_id=?').all(id)
        for (const existing of existingVideos) if (!keep.includes(existing.id)) db.prepare('DELETE FROM resource_videos WHERE id=?').run(existing.id)
        const saveVideo = db.prepare('INSERT INTO resource_videos(id,collection_id,filename,media_type,data_text) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET filename=excluded.filename,media_type=excluded.media_type,data_text=excluded.data_text')
        for (const video of videoRows) if (video.kind === 'upload' && video.data) saveVideo.run(video.id, id, video.filename, video.mediaType, encryptAtRest(video.data))
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
      const updated = db.prepare('SELECT * FROM resource_collections WHERE id=?').get(id)
      return sendJson(res, 200, { collection: resourceSummary(updated, user.id) })
    }
    const roadmapEditRoute = route.match(/^\/api\/roadmaps\/(\d+)$/)
    if (roadmapEditRoute && method === 'PUT') {
      const id = Number(roadmapEditRoute[1])
      const row = db.prepare('SELECT * FROM roadmaps WHERE id=?').get(id)
      if (!row) return sendJson(res, 404, { error: 'That roadmap could not be found.' })
      if (row.owner_id !== user.id) return sendJson(res, 403, { error: 'Only the person who published this roadmap can update it.' })
      const nextUpdateAt = new Date(new Date(row.updated_at.replace(' ', 'T') + (row.updated_at.includes('Z') ? '' : 'Z')).getTime() + 7 * 24 * 60 * 60 * 1000)
      if (Date.now() < nextUpdateAt.getTime()) return sendJson(res, 429, { error: `You can update this roadmap again on ${nextUpdateAt.toLocaleDateString()}.`, nextUpdateAt: nextUpdateAt.toISOString() })
      const { title, summary, category, tags, content } = await readBody(req, 12 * 1024 * 1024)
      const cleanTitle = String(title ?? '').trim().slice(0, 120)
      const cleanSummary = String(summary ?? '').trim().slice(0, 500)
      const cleanCategory = String(category ?? 'General').trim().slice(0, 60) || 'General'
      const cleanTags = Array.isArray(tags) ? [...new Set(tags.map((tag) => String(tag).trim().slice(0, 32)).filter(Boolean))].slice(0, 12) : []
      if (!cleanTitle || !cleanSummary) return sendJson(res, 400, { error: 'Add a title and short description for your roadmap.' })
      const cleanContent = normalizeRoadmapContent(content)
      const contentJson = JSON.stringify(cleanContent)
      if (Buffer.byteLength(contentJson, 'utf8') > 10 * 1024 * 1024) return sendJson(res, 413, { error: 'Roadmap content must be under 10 MB.' })
      db.prepare("UPDATE roadmaps SET title=?,summary=?,category=?,tags_json=?,content_json=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(cleanTitle, cleanSummary, cleanCategory, JSON.stringify(cleanTags), encryptAtRest(contentJson), id)
      const updated = db.prepare('SELECT * FROM roadmaps WHERE id=?').get(id)
      return sendJson(res, 200, { roadmap: { ...roadmapSummary(updated, user.id), content: cleanContent, nextUpdateAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() } })
    }
    if (route.startsWith('/api/admin/')) {
      if (!user.isAdmin) return sendJson(res, 403, { error: 'Admin access is not enabled for this account.' })
      if (route === '/api/admin/overview' && method === 'GET') {
        const totals = db.prepare('SELECT COUNT(*) AS users, SUM(CASE WHEN plan=\'pro\' THEN 1 ELSE 0 END) AS proUsers FROM users').get()
        const users = db.prepare('SELECT u.id,u.username,u.email,u.plan,u.business_plan AS businessPlan,u.account_type AS accountType,u.created_at AS createdAt,COUNT(DISTINCT b.id) AS cloudBoards FROM users u LEFT JOIN boards b ON b.owner_id=u.id GROUP BY u.id ORDER BY u.created_at DESC LIMIT 250').all()
        return sendJson(res, 200, { totals: { users: Number(totals.users ?? 0), proUsers: Number(totals.proUsers ?? 0) }, users })
      }
      const planRoute = route.match(/^\/api\/admin\/users\/(\d+)\/plan$/)
      if (planRoute && method === 'PATCH') {
        const { plan } = await readBody(req, 5_000)
        if (!['normal','pro','standard','class_plus','business'].includes(plan)) return sendJson(res, 400, { error: 'Choose Standard, Class Plus, or Business.' })
        const normalizedPlan = plan === 'standard' || plan === 'normal' ? 'normal' : 'pro'
        const businessPlan = plan === 'business' ? 1 : 0
        const result = db.prepare('UPDATE users SET plan=?,business_plan=? WHERE id=?').run(normalizedPlan, businessPlan, Number(planRoute[1]))
        if (!result.changes) return sendJson(res, 404, { error: 'That account was not found.' })
        return sendJson(res, 200, { ok: true, plan: normalizedPlan, businessPlan: Boolean(businessPlan) })
      }
      return sendJson(res, 404, { error: 'Admin endpoint not found.' })
    }
    if (route === '/api/me/profile' && method === 'PUT') {
      const { displayName, avatar, accountType = 'student' } = await readBody(req, 2 * 1024 * 1024)
      const cleanName = String(displayName ?? '').trim()
      if (!cleanName || cleanName.length > 60) return sendJson(res, 400, { error: 'Choose a display name from 1 to 60 characters.' })
      if (!['student','teacher','business','employee'].includes(accountType)) return sendJson(res, 400, { error: 'Choose a valid account type.' })
      if (avatar !== null && avatar !== undefined && (typeof avatar !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar) || avatar.length > 1_800_000)) return sendJson(res, 400, { error: 'Use a PNG, JPEG, or WebP profile photo under 1.3 MB.' })
      db.prepare('UPDATE users SET display_name=?,avatar_data=?,account_type=? WHERE id=?').run(cleanName, avatar || null, accountType, user.id)
      const updated = db.prepare('SELECT id,username,email,COALESCE(display_name,username) AS displayName,avatar_data AS avatar,password_enabled AS hasPassword,plan,business_plan AS businessPlan,account_type AS accountType,dashboard_options AS dashboardOptionsJson FROM users WHERE id=?').get(user.id)
      let dashboardOptions = null
      if (updated.dashboardOptionsJson !== null) { try { const stored = JSON.parse(updated.dashboardOptionsJson); if (Array.isArray(stored) && stored.every((option) => typeof option === 'string' && dashboardOptionIds.has(option))) dashboardOptions = [...new Set(stored)] } catch { /* Invalid saved preferences are treated as not configured yet. */ } }
      const { dashboardOptionsJson, ...profile } = updated
      return sendJson(res, 200, { user: { ...profile, dashboardOptions, isAdmin: adminUsernames.has(String(profile.username).toLowerCase()) } })
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
      const rows = db.prepare("SELECT DISTINCT b.* FROM boards b LEFT JOIN board_access a ON a.board_id=b.id LEFT JOIN team_board_access tba ON tba.board_id=b.id LEFT JOIN team_members tm ON tm.team_id=tba.team_id WHERE b.owner_id=? OR a.user_id=? OR tm.user_id=? OR EXISTS(SELECT 1 FROM teacher_students ts JOIN users teacher ON teacher.id=ts.teacher_id WHERE ts.teacher_id=? AND ts.student_id=b.owner_id AND ts.status='accepted' AND teacher.account_type='teacher') ORDER BY b.updated_at DESC").all(user.id, user.id, user.id, user.id)
      return sendJson(res, 200, { boards: rows.map((row) => {
        const permission = boardRole(row.id, user.id)
        return { ...shapeBoard(row), role: permission?.role, canDownload: permission?.canDownload ?? false }
      }) })
    }
    if (route === '/api/boards' && method === 'POST') {
      const { name, folderId, state } = await readBody(req)
      const cleanName = String(name ?? '').trim().slice(0, 120)
      if (!cleanName || !state || typeof state !== 'object') return sendJson(res, 400, { error: 'Board name and board data are required.' })
      if (boardNameConflict(user.id, cleanName)) return sendJson(res, 409, { error: 'A file with this name already exists. Choose a different name.' })
      const ownedBoardCount = db.prepare('SELECT COUNT(*) AS count FROM boards WHERE owner_id=?').get(user.id).count
      if (user.plan !== 'pro' && ownedBoardCount >= 1) return sendJson(res, 403, { error: 'Normal accounts can keep one cloud board for collaboration. Your other boards remain saved locally.' })
      if (folderId && !db.prepare('SELECT id FROM folders WHERE id=? AND owner_id=?').get(folderId, user.id)) return sendJson(res, 400, { error: 'That folder does not exist.' })
      const result = db.prepare('INSERT INTO boards(owner_id,folder_id,name,state_json) VALUES(?,?,?,?)').run(user.id, folderId || null, cleanName, encryptAtRest(JSON.stringify(state)))
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
      if (!action && method === 'GET') return sendJson(res, 200, { board: shapeBoard(permission.board), role: permission.role, canDownload: permission.canDownload ?? false })
      if (!action && method === 'PUT') {
        if (permission.role === 'view') return sendJson(res, 403, { error: 'This board is read-only for your account.' })
        const { name, folderId, state } = await readBody(req)
        if (!state || typeof state !== 'object') return sendJson(res, 400, { error: 'Board data is required.' })
        const cleanName = String(name ?? permission.board.name).trim().slice(0, 120)
        if (!cleanName) return sendJson(res, 400, { error: 'Board name is required.' })
        if (boardNameConflict(permission.board.owner_id, cleanName, id)) return sendJson(res, 409, { error: 'A file with this name already exists. Choose a different name.' })
        if (folderId && !db.prepare('SELECT id FROM folders WHERE id=? AND owner_id=?').get(folderId, permission.board.owner_id)) return sendJson(res, 400, { error: 'That folder does not exist for this board owner.' })
        db.prepare('UPDATE boards SET name=?,folder_id=?,state_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(cleanName, folderId || null, encryptAtRest(JSON.stringify(state)), id)
        notifyBoard(id, 'board-updated')
        return sendJson(res, 200, { board: shapeBoard(db.prepare('SELECT * FROM boards WHERE id=?').get(id)) })
      }
      if (action === 'share' && method === 'GET') {
        if (permission.role !== 'owner') return sendJson(res, 403, { error: 'Only the board owner can manage access.' })
        const rows = db.prepare('SELECT u.id,u.username,a.role,a.can_download AS canDownload FROM board_access a JOIN users u ON u.id=a.user_id WHERE a.board_id=? ORDER BY u.username').all(id)
        return sendJson(res, 200, { access: rows })
      }
      if (action === 'share' && method === 'POST') {
        if (permission.role !== 'owner') return sendJson(res, 403, { error: 'Only the board owner can manage access.' })
        const { username, role, canDownload = false } = await readBody(req)
        const target = db.prepare('SELECT id FROM users WHERE username=?').get(String(username ?? '').trim())
        if (!target) return sendJson(res, 404, { error: 'Create an account for that person first.' })
        if (!['view', 'edit'].includes(role) || typeof canDownload !== 'boolean' || (role === 'edit' && canDownload)) return sendJson(res, 400, { error: 'Choose read, edit, or download access.' })
        if (user.plan !== 'pro') {
          const otherSharedBoard = db.prepare('SELECT b.id FROM boards b WHERE b.owner_id=? AND b.id<>? AND (EXISTS(SELECT 1 FROM board_access a WHERE a.board_id=b.id) OR EXISTS(SELECT 1 FROM team_board_access t WHERE t.board_id=b.id) OR EXISTS(SELECT 1 FROM public_links p WHERE p.board_id=b.id)) LIMIT 1').get(user.id, id)
          if (otherSharedBoard) return sendJson(res, 403, { error: 'Normal accounts can collaborate on one document. Fun Plan removes this limit.' })
        }
        db.prepare('INSERT INTO board_access(board_id,user_id,role,can_download) VALUES(?,?,?,?) ON CONFLICT(board_id,user_id) DO UPDATE SET role=excluded.role,can_download=excluded.can_download').run(id, target.id, role, canDownload ? 1 : 0)
        notifyBoard(id, 'access-updated')
        return sendJson(res, 200, { username, role, canDownload })
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
        if (user.plan !== 'pro' && db.prepare('SELECT b.id FROM boards b WHERE b.owner_id=? AND b.id<>? AND (EXISTS(SELECT 1 FROM board_access a WHERE a.board_id=b.id) OR EXISTS(SELECT 1 FROM team_board_access t WHERE t.board_id=b.id) OR EXISTS(SELECT 1 FROM public_links p WHERE p.board_id=b.id)) LIMIT 1').get(user.id, id)) return sendJson(res, 403, { error: 'Normal accounts can collaborate on one document. Fun Plan removes this limit.' })
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
        if (user.plan !== 'pro' && db.prepare('SELECT b.id FROM boards b WHERE b.owner_id=? AND b.id<>? AND (EXISTS(SELECT 1 FROM board_access a WHERE a.board_id=b.id) OR EXISTS(SELECT 1 FROM team_board_access t WHERE t.board_id=b.id) OR EXISTS(SELECT 1 FROM public_links p WHERE p.board_id=b.id)) LIMIT 1').get(user.id, id)) return sendJson(res, 403, { error: 'Normal accounts can collaborate on one document. Fun Plan removes this limit.' })
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
        const rows = db.prepare('SELECT c.id,c.body,c.created_at AS createdAt,u.username FROM comments c JOIN users u ON u.id=c.user_id WHERE c.board_id=? ORDER BY c.id').all(id).map((row) => ({ ...row, body: decryptAtRest(row.body) }))
        return sendJson(res, 200, { comments: rows })
      }
      if (action === 'comments' && method === 'POST') {
        if (user.plan !== 'pro') return sendJson(res, 403, { error: 'Comments are included in Fun Plan.' })
        const { body } = await readBody(req)
        const cleanBody = String(body ?? '').trim().slice(0, 4000)
        if (!cleanBody) return sendJson(res, 400, { error: 'Write a comment first.' })
        const result = db.prepare('INSERT INTO comments(board_id,user_id,body) VALUES(?,?,?)').run(id, user.id, encryptAtRest(cleanBody))
        notifyBoard(id, 'comment-added')
        const comment = db.prepare('SELECT c.id,c.body,c.created_at AS createdAt,u.username FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(Number(result.lastInsertRowid))
        return sendJson(res, 201, { comment: { ...comment, body: decryptAtRest(comment.body) } })
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


