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
  CREATE TABLE IF NOT EXISTS teacher_students (teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')), permission TEXT NOT NULL DEFAULT 'view' CHECK(permission IN ('view','edit')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(teacher_id,student_id), CHECK(teacher_id<>student_id));
  CREATE INDEX IF NOT EXISTS roadmaps_updated_at_idx ON roadmaps(updated_at DESC);
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
  const user = db.prepare('SELECT users.id, users.username, users.email, COALESCE(users.display_name, users.username) AS displayName, users.avatar_data AS avatar, users.password_enabled AS hasPassword, users.plan, users.business_plan AS businessPlan, users.account_type AS accountType FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?').get(hash, Date.now())
  return user ? { ...user, isAdmin: adminUsernames.has(String(user.username).toLowerCase()) } : null
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
        if (!node || typeof node !== 'object' || !validShapes.has(node.shape) || !validColors.has(node.color)) throw new Error('Concept map objects need a supported shape an