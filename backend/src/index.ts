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
  res.json({ status: 'ok', storageMode: getStorageMode() })
})

// Proxy endpoint for fetching images (avoids CORS issues)
app.get('/api/proxy-image', async (req, res) => {
  const url = req.query.url as string
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' })
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch image' })
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)

    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('Proxy image error:', err)
    res.status(500).json({ error: 'Failed to proxy image' })
  }
})

// Proxy endpoint for fetching videos (avoids CORS issues)
app.get('/api/proxy-video', async (req, res) => {
  const url = req.query.url as string
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' })
  }

  try {
    const response = await fetch(url)
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch video' })
    }

    const contentType = response.headers.get('content-type') || 'video/mp4'
    res.setHeader('Content-Type', contentType)

    const buffer = await response.arrayBuffer()
    res.send(Buffer.from(buffer))
  } catch (err) {
    console.error('Proxy video error:', err)
    res.status(500).json({ error: 'Failed to proxy video' })
  }
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
