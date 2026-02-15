import { Router } from 'express'

const router = Router()

// GET /api/w/:workspace/embed/youtube-title?videoId=xxx
router.get('/youtube-title', async (req, res) => {
  const { videoId } = req.query
  if (!videoId || typeof videoId !== 'string') {
    return res.status(400).json({ error: 'videoId query parameter required' })
  }

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`
    const response = await fetch(oembedUrl)
    if (!response.ok) {
      return res.json({ title: 'YouTube Video' })
    }
    const data = await response.json() as { title?: string }
    res.json({ title: data.title || 'YouTube Video' })
  } catch {
    res.json({ title: 'YouTube Video' })
  }
})

export default router
