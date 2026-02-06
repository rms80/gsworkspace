import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import itemsRouter from './routes/items.js'
import llmRouter from './routes/llm.js'
import scenesRouter from './routes/scenes.js'
import localFilesRouter from './routes/localFiles.js'
import configRouter from './routes/config.js'
import { getStorageMode } from './services/storage.js'
import { initializeStorage } from './services/diskStorage.js'
import { getS3ConfigStatus } from './services/s3.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

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
}))
app.use(express.json({ limit: '50mb' }))

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

app.use('/api/', generalLimiter)
app.use('/api/llm', llmLimiter)
app.use('/api/items/upload-image', uploadLimiter)
app.use('/api/items/upload-video', uploadLimiter)

app.use('/api/items', itemsRouter)
app.use('/api/llm', llmRouter)
app.use('/api/scenes', scenesRouter)
app.use('/api/local-files', localFilesRouter)
app.use('/api/config', configRouter)

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
