import { Router } from 'express'
import { saveToS3, loadFromS3, listFromS3, getPublicUrl } from '../services/s3.js'
import { v4 as uuidv4 } from 'uuid'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Configure ffmpeg to use the bundled binary from ffmpeg-static
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

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
    console.log(`Uploading video to S3: ${key}, size: ${Buffer.from(base64Data, 'base64').length} bytes`)
    await saveToS3(key, Buffer.from(base64Data, 'base64'), contentType || 'video/mp4')
    console.log(`Video uploaded successfully: ${key}`)

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

// Process a video (crop and/or speed change) and save to S3
router.post('/crop-video', async (req, res) => {
  const tempDir = os.tmpdir()
  const inputPath = path.join(tempDir, `video-input-${uuidv4()}.mp4`)
  const outputPath = path.join(tempDir, `video-output-${uuidv4()}.mp4`)

  // Helper to clean up temp files
  const cleanup = () => {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath) } catch { /* ignore */ }
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath) } catch { /* ignore */ }
  }

  try {
    const { src, cropRect, speed, removeAudio } = req.body
    console.log('crop-video request:', { src: src?.substring(0, 50), cropRect, speed, removeAudio })
    if (!src) {
      return res.status(400).json({ error: 'src is required' })
    }
    if (!cropRect && (!speed || speed === 1) && !removeAudio) {
      console.log('crop-video rejected: no cropRect, speed is 1 or undefined, and removeAudio is false')
      return res.status(400).json({ error: 'cropRect, speed change, or removeAudio is required' })
    }

    // Download video to temp file
    const response = await fetch(src)
    if (!response.ok) {
      return res.status(400).json({ error: 'Failed to fetch source video' })
    }
    const arrayBuffer = await response.arrayBuffer()
    fs.writeFileSync(inputPath, Buffer.from(arrayBuffer))

    // Build ffmpeg command with filters
    const videoFilters: string[] = []
    const audioFilters: string[] = []

    // Add crop filter if cropRect provided
    if (cropRect) {
      let { x, y, width, height } = cropRect
      // Ensure even dimensions (required by H.264)
      x = Math.round(x)
      y = Math.round(y)
      width = Math.round(width / 2) * 2
      height = Math.round(height / 2) * 2
      videoFilters.push(`crop=${width}:${height}:${x}:${y}`)
    }

    // Add speed filter if speed provided and not 1
    const effectiveSpeed = speed && speed !== 1 ? speed : null
    if (effectiveSpeed) {
      // Video: setpts divides by speed (faster = smaller PTS values)
      videoFilters.push(`setpts=PTS/${effectiveSpeed}`)

      // Audio: atempo only supports 0.5-2.0, so chain multiple for extreme values
      // For speed > 1 (faster): atempo=speed (chain if > 2)
      // For speed < 1 (slower): atempo=speed (chain if < 0.5)
      let remainingSpeed = effectiveSpeed
      while (remainingSpeed > 2.0) {
        audioFilters.push('atempo=2.0')
        remainingSpeed /= 2.0
      }
      while (remainingSpeed < 0.5) {
        audioFilters.push('atempo=0.5')
        remainingSpeed /= 0.5
      }
      audioFilters.push(`atempo=${remainingSpeed}`)
    }

    // Process with ffmpeg
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg(inputPath)

      if (videoFilters.length > 0) {
        cmd.videoFilter(videoFilters)
      }

      cmd.outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23'])

      // Handle audio: remove, re-encode for speed change, or copy
      if (removeAudio) {
        cmd.noAudio()
      } else if (audioFilters.length > 0) {
        cmd.audioFilter(audioFilters)
        cmd.outputOptions(['-c:a', 'aac', '-b:a', '128k'])
      } else {
        cmd.outputOptions(['-c:a', 'copy'])
      }

      cmd.output(outputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    // Read cropped video
    const croppedBuffer = fs.readFileSync(outputPath)

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
      key = `${basePath}.crop.mp4`
    } else {
      // For other sources, generate a new key
      key = `videos/${uuidv4()}-crop.mp4`
    }

    await saveToS3(key, croppedBuffer, 'video/mp4')
    const url = getPublicUrl(key)

    cleanup()
    res.json({ success: true, url })
  } catch (error) {
    cleanup()
    console.error('Error processing video:', error)
    res.status(500).json({ error: 'Failed to process video' })
  }
})

export default router
