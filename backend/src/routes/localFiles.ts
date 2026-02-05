import { Router, Request, Response } from 'express'
import { resolveFilePath, getContentTypeFromKey } from '../services/diskStorage.js'
import * as path from 'path'
import * as fs from 'fs'

const router = Router()

// Serve files from local disk storage with Range request support
// GET /api/local-files/*
router.get('/*', async (req: Request, res: Response) => {
  try {
    // Extract the key from the URL path
    // req.params[0] contains everything after /api/local-files/
    const key = (req.params as Record<string, string>)[0]

    if (!key) {
      return res.status(400).json({ error: 'File path is required' })
    }

    // Security: prevent path traversal
    const normalizedKey = path.normalize(key)
    if (normalizedKey.includes('..') || normalizedKey.startsWith('/') || normalizedKey.startsWith('\\')) {
      return res.status(403).json({ error: 'Invalid file path' })
    }

    // Resolve to validated file path
    let filePath: string
    try {
      filePath = resolveFilePath(key)
    } catch {
      return res.status(403).json({ error: 'Invalid file path' })
    }

    // Check file exists and get size
    let stat: fs.Stats
    try {
      stat = fs.statSync(filePath)
    } catch {
      return res.status(404).json({ error: 'File not found' })
    }

    const fileSize = stat.size
    const contentType = getContentTypeFromKey(key)

    // Set cache headers for media files
    if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000') // 1 year
    }

    // Handle Range requests (required for video seeking)
    const range = req.headers.range
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunkSize = end - start + 1

      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`)
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Content-Length', chunkSize)
      res.setHeader('Content-Type', contentType)

      const stream = fs.createReadStream(filePath, { start, end })
      stream.pipe(res)
    } else {
      // No Range header — send full file
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Content-Length', fileSize)
      res.setHeader('Content-Type', contentType)

      const stream = fs.createReadStream(filePath)
      stream.pipe(res)
    }
  } catch (error) {
    console.error('Error serving local file:', error)
    res.status(500).json({ error: 'Failed to serve file' })
  }
})

export default router
