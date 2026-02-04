import express from 'express'
import cors from 'cors'
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

app.use(cors())
app.use(express.json({ limit: '50mb' }))

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
