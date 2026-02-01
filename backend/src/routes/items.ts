import { Router } from 'express'
import { saveToS3, loadFromS3, listFromS3, getPublicUrl } from '../services/s3.js'
import { v4 as uuidv4 } from 'uuid'
import sharp from 'sharp'

const router = Router()

// Save canvas state
router.post('/save', async (req, res) => {
  try {
    const { items } = req.body
    const id = uuidv4()
    await saveToS3(`canvas/${id}.json`, JSON.stringify(items))
    res.json({ success: true, id })
  } catch (error) {
    console.error('Error saving items:', error)
    res.status(500).json({ error: 'Failed to save items' })
  }
})

// Load canvas state
router.get('/load/:id', async (req, res) => {
  try {
    const data = await loadFromS3(`canvas/${req.params.id}.json`)
    if (!data) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.json(JSON.parse(data))
  } catch (error) {
    console.error('Error loading items:', error)
    res.status(500).json({ error: 'Failed to load items' })
  }
})

// List all saved canvases
router.get('/list', async (_req, res) => {
  try {
    const files = await listFromS3('canvas/')
    res.json(files)
  } catch (error) {
    console.error('Error listing items:', error)
    res.status(500).json({ error: 'Failed to list items' })
  }
})

// Upload image
router.post('/upload-image', async (req, res) => {
  try {
    const { imageData, filename } = req.body
    const id = uuidv4()
    const key = `temp/images/${id}-${filename}`

    // imageData is base64, convert to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    await saveToS3(key, Buffer.from(base64Data, 'base64'), 'image/png')

    // Return the S3 URL (for public bucket)
    const bucketName = process.env.S3_BUCKET_NAME
    const region = process.env.AWS_REGION || 'us-east-1'
    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`

    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading image:', error)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

// Upload video
router.post('/upload-video', async (req, res) => {
  try {
    const { videoData, filename, contentType } = req.body
    const id = uuidv4()

    // Determine file extension from content type or filename
    let ext = 'mp4'
    if (contentType) {
      const match = contentType.match(/video\/(\w+)/)
      if (match) ext = match[1]
    } else if (filename) {
      const dotIndex = filename.lastIndexOf('.')
      if (dotIndex >= 0) ext = filename.slice(dotIndex + 1)
    }

    const key = `temp/videos/${id}-${filename || `video.${ext}`}`

    // videoData is base64 data URL, convert to buffer
    const base64Data = videoData.replace(/^data:video\/\w+;base64,/, '')
    await saveToS3(key, Buffer.from(base64Data, 'base64'), contentType || 'video/mp4')

    // Return the S3 URL (for public bucket)
    const bucketName = process.env.S3_BUCKET_NAME
    const region = process.env.AWS_REGION || 'us-east-1'
    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`

    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading video:', error)
    res.status(500).json({ error: 'Failed to upload video' })
  }
})

// Crop an image and save the cropped version to S3
router.post('/crop-image', async (req, res) => {
  try {
    const { src, cropRect } = req.body
    if (!src || !cropRect) {
      return res.status(400).json({ error: 'src and cropRect are required' })
    }

    const { x, y, width, height } = cropRect

    // Get image buffer from source
    let buffer: Buffer
    if (src.startsWith('data:')) {
      const base64Data = src.replace(/^data:image\/\w+;base64,/, '')
      buffer = Buffer.from(base64Data, 'base64')
    } else {
      // Fetch from URL (S3 or other)
      const response = await fetch(src)
      if (!response.ok) {
        return res.status(400).json({ error: 'Failed to fetch source image' })
      }
      const arrayBuffer = await response.arrayBuffer()
      buffer = Buffer.from(arrayBuffer)
    }

    // Crop with sharp
    const croppedBuffer = await sharp(buffer)
      .extract({ left: Math.round(x), top: Math.round(y), width: Math.round(width), height: Math.round(height) })
      .png()
      .toBuffer()

    // Derive S3 key for the crop file
    let key: string
    const bucketName = process.env.S3_BUCKET_NAME
    const region = process.env.AWS_REGION || 'us-east-1'
    const s3UrlPrefix = `https://${bucketName}.s3.${region}.amazonaws.com/`

    if (src.startsWith(s3UrlPrefix)) {
      // For S3 URLs, derive crop key from original key
      const originalKey = src.slice(s3UrlPrefix.length)
      const dotIndex = originalKey.lastIndexOf('.')
      const basePath = dotIndex >= 0 ? originalKey.slice(0, dotIndex) : originalKey
      key = `${basePath}.crop.png`
    } else {
      // For data URLs or other sources, generate a new key
      key = `images/${uuidv4()}-crop.png`
    }

    await saveToS3(key, croppedBuffer, 'image/png')
    const url = getPublicUrl(key)

    res.json({ success: true, url })
  } catch (error) {
    console.error('Error cropping image:', error)
    res.status(500).json({ error: 'Failed to crop image' })
  }
})

export default router
