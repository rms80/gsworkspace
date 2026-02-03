import { Router, Request, Response } from 'express'
import { loadFromDiskAsBuffer, getContentTypeFromKey } from '../services/diskStorage.js'
import * as path from 'path'

const router = Router()

// Serve files from local disk storage
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

    // Load the file from disk
    const buffer = await loadFromDiskAsBuffer(key)

    if (!buffer) {
      return res.status(404).json({ error: 'File not found' })
    }

    // Set appropriate content type
    const contentType = getContentTypeFromKey(key)
    res.setHeader('Content-Type', contentType)

    // Set cache headers for media files
    if (contentType.startsWith('image/') || contentType.startsWith('video/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000') // 1 year
    }

    res.send(buffer)
  } catch (error) {
    console.error('Error serving local file:', error)
    res.status(500).json({ error: 'Failed to serve file' })
  }
})

export default router
