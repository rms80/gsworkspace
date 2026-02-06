import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieSession from 'cookie-session'
import crypto from 'crypto'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import itemsRouter from './routes/items.js'
import llmRouter from './routes/llm.js'
import scenesRouter from './routes/scenes.js'
import localFilesRouter from './routes/localFiles.js'
import configRouter from './routes/config.js'
import workspacesRouter from './routes/workspaces.js'
import { getStorageMode } from './services/storage.js'
import { initializeStorage } from './services/diskStorage.js'
import { getS3ConfigStatus } from './services/s3.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

const SERVER_NAME = process.env.SERVER_NAME || 'gsworkspace'
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || ''
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  if (AUTH_PASSWORD) {
    console.warn('WARNING: SESSION_SECRET not set. Using a random secret — sessions will be invalidated on restart.')
  }
  return crypto.randomBytes(32).toString('hex')
})()

app.use(helmet())
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g., server-to-server, curl)
    if (!origin) return callback(null, true)

    // Allow any localhost origin (dev)
    if (origin.startsWith('http://localhost:') || origin === 'http://localhost') {
      return callback(null, true)
    }

    // Check allowed origins from env
    const allowed = process.env.ALLOWED_ORIGINS?.split(',') || []
    if (allowed.includes(origin)) return callback(null, true)

    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
}))
app.use(express.json({ limit: '50mb' }))

// Session middleware (cookie-based, signed with secret)
app.use(cookieSession({
  name: 'gsworkspace_session',
  keys: [SESSION_SECRET],
  maxAge: parseInt(process.env.SESSION_MAX_AGE_DAYS || '7') * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
}))

// --- Auth routes (public, before auth middleware) ---

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_AUTH || '25'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
})

app.get('/api/auth/status', (req, res) => {
  const authRequired = !!AUTH_PASSWORD
  const authenticated = !authRequired || !!req.session?.authenticated
  res.json({ authRequired, authenticated, serverName: SERVER_NAME })
})

app.post('/api/auth/login', authLimiter, (req, res) => {
  if (!AUTH_PASSWORD) {
    return res.json({ success: true })
  }

  const { password } = req.body ?? {}
  if (typeof password !== 'string' || password !== AUTH_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password' })
  }

  req.session!.authenticated = true
  res.json({ success: true })
})

app.post('/api/auth/logout', (req, res) => {
  req.session = null
  res.json({ success: true })
})

// --- Auth middleware (protects all subsequent /api/ routes) ---

app.use('/api', (req, res, next) => {
  // Auth disabled if no password set
  if (!AUTH_PASSWORD) return next()

  // Already authenticated
  if (req.session?.authenticated) return next()

  res.status(401).json({ error: 'Authentication required' })
})

// Rate limiting (max requests per 15-minute window)
const RATE_WINDOW = 15 * 60 * 1000

const generalLimiter = rateLimit({
  windowMs: RATE_WINDOW,
  max: parseInt(process.env.RATE_LIMIT_GENERAL || '1000'),
  standardHeaders: true,
  legacyHeaders: false,
})

const llmLimiter = rateLimit({
  windowMs: RATE_WINDOW,
  max: parseInt(process.env.RATE_LIMIT_LLM || '20'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many LLM requests. Please try again later.' },
})

const uploadLimiter = rateLimit({
  windowMs: RATE_WINDOW,
  max: parseInt(process.env.RATE_LIMIT_UPLOAD || '60'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many upload requests. Please try again later.' },
})

const workspaceCreateLimiter = rateLimit({
  windowMs: RATE_WINDOW,
  max: parseInt(process.env.RATE_LIMIT_WORKSPACE_CREATE || '10'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many workspace creation requests. Please try again later.' },
})

// Workspace param validation middleware
const WORKSPACE_RE = /^[a-zA-Z0-9_-]{1,64}$/
app.param('workspace', (req, res, next, value) => {
  if (!WORKSPACE_RE.test(value)) {
    return res.status(400).json({ error: 'Invalid workspace name. Must be 1-64 alphanumeric, hyphen, or underscore characters.' })
  }
  next()
})

// Rate limiters on workspace-prefixed paths
app.use('/api/w/:workspace/', generalLimiter)
app.use('/api/w/:workspace/llm', llmLimiter)
app.use('/api/w/:workspace/items/upload-image', uploadLimiter)
app.use('/api/w/:workspace/items/upload-video', uploadLimiter)

// App routers mounted under workspace prefix
app.use('/api/w/:workspace/items', itemsRouter)
app.use('/api/w/:workspace/llm', llmRouter)
app.use('/api/w/:workspace/scenes', scenesRouter)

// Non-workspace routes
app.use('/api/local-files', localFilesRouter)
app.use('/api/config', configRouter)
app.use('/api/workspaces', generalLimiter)
app.post('/api/workspaces', workspaceCreateLimiter)
app.use('/api/workspaces', workspacesRouter)

app.get('/api/health', (_req, res) => {
  const storageMode = getStorageMode()
  const response: {
    status: 'ok' | 'misconfigured'
    storageMode: string
    configWarning?: string
  } = {
    status: 'ok',
    storageMode,
  }

  // Check S3 configuration when in online mode
  if (storageMode === 'online') {
    const s3Status = getS3ConfigStatus()
    if (!s3Status.configured) {
      response.status = 'misconfigured'
      response.configWarning = s3Status.message
    }
  }

  res.json(response)
})

// Initialize storage and start server
async function start() {
  const storageMode = getStorageMode()
  console.log(`Storage mode: ${storageMode}`)

  // Initialize local storage directory if in local mode
  if (storageMode === 'local') {
    await initializeStorage()
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`)
  })
}

start().catch(console.error)
