import { Router } from 'express'
import { save, load, list, getPublicUrl, getStorageMode } from '../services/storage.js'
import { v4 as uuidv4 } from 'uuid'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import multer from 'multer'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Configure ffmpeg to use the bundled binary from ffmpeg-static
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

// Configure multer for multipart file uploads (500MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }
})

const router = Router()

// Save canvas state
router.post('/save', async (req, res) => {
  try {
    const { items } = req.body
    const id = uuidv4()
    await save(`canvas/${id}.json`, JSON.stringify(items))
    res.json({ success: true, id })
  } catch (error) {
    console.error('Error saving items:', error)
    res.status(500).json({ error: 'Failed to save items' })
  }
})

// Load canvas state
router.get('/load/:id', async (req, res) => {
  try {
    const data = await load(`canvas/${req.params.id}.json`)
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
    const files = await list('canvas/')
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
    await save(key, Buffer.from(base64Data, 'base64'), 'image/png')

    // Return the appropriate URL based on storage mode
    const url = getPublicUrl(key)

    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading image:', error)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

// Upload video (multipart/form-data)
router.post('/upload-video', upload.single('video'), async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ error: 'No video file provided' })
    }

    const id = uuidv4()
    const filename = file.originalname
    const contentType = file.mimetype

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

    console.log(`Uploading video: ${key}, size: ${file.buffer.length} bytes`)
    await save(key, file.buffer, contentType || 'video/mp4')
    console.log(`Video uploaded successfully: ${key}`)

    // Return the appropriate URL based on storage mode
    const url = getPublicUrl(key)

    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading video:', error)
    res.status(500).json({ error: 'Failed to upload video' })
  }
})

// Helper to extract storage key from a URL (works for both S3 and local URLs)
function getKeyFromUrl(url: string): string | null {
  const storageMode = getStorageMode()

  if (storageMode === 'local') {
    // Local URLs are like /api/local-files/{key}
    const localPrefix = '/api/local-files/'
    if (url.startsWith(localPrefix)) {
      return url.slice(localPrefix.length)
    }
  } else {
    // S3 URLs
    const bucketName = process.env.S3_BUCKET_NAME
    const region = process.env.AWS_REGION || 'us-east-1'
    const prefix = `https://${bucketName}.s3.${region}.amazonaws.com/`
    if (url.startsWith(prefix)) {
      return url.slice(prefix.length)
    }
  }
  return null
}

// Crop an image and save the cropped version
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
      // Fetch from URL (S3, local, or other)
      // For local URLs, we need to convert them to absolute URLs
      let fetchUrl = src
      if (src.startsWith('/api/local-files/')) {
        // Local file - construct full URL using request host
        fetchUrl = `http://localhost:${process.env.PORT || 4000}${src}`
      }
      const response = await fetch(fetchUrl)
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

    // Derive key for the crop file
    let key: string
    const originalKey = getKeyFromUrl(src)

    if (originalKey) {
      // Derive crop key from original key
      const dotIndex = originalKey.lastIndexOf('.')
      const basePath = dotIndex >= 0 ? originalKey.slice(0, dotIndex) : originalKey
      key = `${basePath}.crop.png`
    } else {
      // For data URLs or other sources, generate a new key
      key = `images/${uuidv4()}-crop.png`
    }

    await save(key, croppedBuffer, 'image/png')
    const url = getPublicUrl(key)

    res.json({ success: true, url })
  } catch (error) {
    console.error('Error cropping image:', error)
    res.status(500).json({ error: 'Failed to crop image' })
  }
})

// User folder - must match scenes.ts
const USER_FOLDER = 'version0'

// Process a video (crop, speed change, trim) and save
router.post('/crop-video', async (req, res) => {
  const tempDir = os.tmpdir()
  const inputPath = path.join(tempDir, `video-input-${uuidv4()}.mp4`)
  const intermediatePath = path.join(tempDir, `video-intermediate-${uuidv4()}.mp4`)
  const outputPath = path.join(tempDir, `video-output-${uuidv4()}.mp4`)

  // Helper to clean up temp files
  const cleanup = () => {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath) } catch { /* ignore */ }
    try { if (fs.existsSync(intermediatePath)) fs.unlinkSync(intermediatePath) } catch { /* ignore */ }
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath) } catch { /* ignore */ }
  }

  try {
    const { sceneId, videoId, cropRect, speed, removeAudio, trim, extension } = req.body
    console.log('crop-video request:', { sceneId, videoId, cropRect, speed, removeAudio, trim, extension })
    if (!sceneId || !videoId) {
      return res.status(400).json({ error: 'sceneId and videoId are required' })
    }
    const hasTrim = trim && (trim.start > 0 || trim.end > 0)
    if (!cropRect && (!speed || speed === 1) && !removeAudio && !hasTrim) {
      console.log('crop-video rejected: no cropRect, speed is 1 or undefined, removeAudio is false, and no trim')
      return res.status(400).json({ error: 'cropRect, speed change, removeAudio, or trim is required' })
    }

    // Construct the source video URL from scene and video IDs
    // Use provided extension or default to mp4
    const sourceExt = extension || 'mp4'
    const sceneFolder = `${USER_FOLDER}/${sceneId}`
    const sourceKey = `${sceneFolder}/${videoId}.${sourceExt}`
    let sourceUrl = getPublicUrl(sourceKey)

    // For local URLs, convert to absolute URLs for fetching
    if (sourceUrl.startsWith('/api/local-files/')) {
      sourceUrl = `http://localhost:${process.env.PORT || 4000}${sourceUrl}`
    }

    // Download video to temp file
    const response = await fetch(sourceUrl)
    if (!response.ok) {
      return res.status(400).json({ error: `Failed to fetch source video: ${sourceUrl}` })
    }
    const arrayBuffer = await response.arrayBuffer()
    fs.writeFileSync(inputPath, Buffer.from(arrayBuffer))

    const effectiveSpeed = speed && speed !== 1 ? speed : null

    // If both trim and speed are used, we need two passes to avoid timing issues
    // Pass 1: crop + trim -> intermediate file
    // Pass 2: speed change -> output file
    // If no trim, we can do everything in one pass
    const needsTwoPasses = hasTrim && effectiveSpeed

    if (needsTwoPasses) {
      // PASS 1: Crop and trim
      await new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(inputPath)

        // Apply trim as input options
        if (trim.start > 0) {
          cmd.inputOptions(['-ss', String(trim.start)])
        }
        if (trim.end > 0) {
          const duration = trim.end - (trim.start || 0)
          if (duration > 0) {
            cmd.inputOptions(['-t', String(duration)])
          }
        }

        // Apply crop filter
        if (cropRect) {
          let { x, y, width, height } = cropRect
          x = Math.round(x)
          y = Math.round(y)
          width = Math.round(width / 2) * 2
          height = Math.round(height / 2) * 2
          cmd.videoFilter([`crop=${width}:${height}:${x}:${y}`])
        }

        cmd.outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23'])

        if (removeAudio) {
          cmd.noAudio()
        } else {
          cmd.outputOptions(['-c:a', 'aac', '-b:a', '128k'])
        }

        cmd.output(intermediatePath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })

      // PASS 2: Apply speed change
      await new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(intermediatePath)

        // Video speed filter
        cmd.videoFilter([`setpts=PTS/${effectiveSpeed}`])

        // Audio speed filter (atempo only supports 0.5-2.0, chain for extreme values)
        if (!removeAudio) {
          const audioFilters: string[] = []
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
          cmd.audioFilter(audioFilters)
          cmd.outputOptions(['-c:a', 'aac', '-b:a', '128k'])
        } else {
          cmd.noAudio()
        }

        cmd.outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23'])
        cmd.output(outputPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })
    } else {
      // Single pass: no trim, or no speed change
      const videoFilters: string[] = []
      const audioFilters: string[] = []

      // Add crop filter if cropRect provided
      if (cropRect) {
        let { x, y, width, height } = cropRect
        x = Math.round(x)
        y = Math.round(y)
        width = Math.round(width / 2) * 2
        height = Math.round(height / 2) * 2
        videoFilters.push(`crop=${width}:${height}:${x}:${y}`)
      }

      // Add speed filter if speed provided and not 1
      if (effectiveSpeed) {
        videoFilters.push(`setpts=PTS/${effectiveSpeed}`)

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

      await new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(inputPath)

        // Apply trim as input options for efficiency (seeks before decoding)
        if (hasTrim) {
          if (trim.start > 0) {
            cmd.inputOptions(['-ss', String(trim.start)])
          }
          if (trim.end > 0) {
            const duration = trim.end - (trim.start || 0)
            if (duration > 0) {
              cmd.inputOptions(['-t', String(duration)])
            }
          }
        }

        if (videoFilters.length > 0) {
          cmd.videoFilter(videoFilters)
        }

        cmd.outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23'])

        // Handle audio: remove, re-encode for speed change, or copy
        if (removeAudio) {
          cmd.noAudio()
        } else if (audioFilters.length > 0 || hasTrim) {
          if (audioFilters.length > 0) {
            cmd.audioFilter(audioFilters)
          }
          cmd.outputOptions(['-c:a', 'aac', '-b:a', '128k'])
        } else {
          cmd.outputOptions(['-c:a', 'copy'])
        }

        cmd.output(outputPath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })
    }

    // Read processed video
    const processedBuffer = fs.readFileSync(outputPath)

    // Save to storage with .crop suffix
    const outputKey = `${sceneFolder}/${videoId}.crop.mp4`
    await save(outputKey, processedBuffer, 'video/mp4')

    cleanup()
    res.json({ success: true })
  } catch (error) {
    cleanup()
    console.error('Error processing video:', error)
    res.status(500).json({ error: 'Failed to process video' })
  }
})

export default router
