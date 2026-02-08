import { Router } from 'express'
import { save, loadAsBuffer, getPublicUrl } from '../services/storage.js'
import { v4 as uuidv4, validate as uuidValidate } from 'uuid'
import sharp from 'sharp'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegStatic from 'ffmpeg-static'
import ffprobeStatic from 'ffprobe-static'
import multer from 'multer'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// Configure ffmpeg/ffprobe to use the bundled binaries
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}
if (ffprobeStatic?.path) {
  ffmpeg.setFfprobePath(ffprobeStatic.path)
}

// Browser-native video formats that don't need transcoding
const BROWSER_NATIVE_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'ogv'])

/**
 * Transcode a video file to MP4 (H.264/AAC) with faststart for streaming.
 */
function transcodeToMp4(inputPath: string, outputPath: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run()
  })
}

// Configure multer for multipart file uploads (500MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }
})

const router = Router({ mergeParams: true })

// Upload image
router.post('/upload-image', async (req, res) => {
  try {
    const { imageData, sceneId, itemId, filename } = req.body
    if (!sceneId || !itemId) {
      return res.status(400).json({ error: 'sceneId and itemId are required' })
    }
    if (!uuidValidate(sceneId) || !uuidValidate(itemId)) {
      return res.status(400).json({ error: 'Invalid scene ID or item ID format' })
    }

    // Determine file extension from filename or default to png
    let ext = 'png'
    if (filename) {
      const dotIndex = filename.lastIndexOf('.')
      if (dotIndex >= 0) ext = filename.slice(dotIndex + 1).toLowerCase()
    }
    // Sanitize extension: strip any path separators
    ext = ext.replace(/[/\\]/g, '')

    // Save directly to scene folder with itemId
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const key = `${sceneFolder}/${itemId}.${ext}`

    // imageData is base64, convert to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    await save(key, Buffer.from(base64Data, 'base64'), `image/${ext}`)

    // Return the appropriate URL based on storage mode
    const url = getPublicUrl(key)

    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading image:', error)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

// Upload video (multipart/form-data) — transcodes non-browser-native formats to MP4
router.post('/upload-video', upload.single('video'), async (req, res) => {
  const tempDir = os.tmpdir()
  const tempId = uuidv4()
  const inputPath = path.join(tempDir, `upload-input-${tempId}`)
  const outputPath = path.join(tempDir, `upload-output-${tempId}.mp4`)

  const cleanup = () => {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath) } catch { /* ignore */ }
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath) } catch { /* ignore */ }
  }

  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ error: 'No video file provided' })
    }

    // Use client-provided sceneId and itemId to save directly to scene folder
    const sceneId = req.body.sceneId
    const itemId = req.body.itemId
    if (!sceneId || !itemId) {
      return res.status(400).json({ error: 'sceneId and itemId are required' })
    }
    if (!uuidValidate(sceneId) || !uuidValidate(itemId)) {
      return res.status(400).json({ error: 'Invalid scene ID or item ID format' })
    }

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const filename = file.originalname

    // Determine file extension from filename
    let ext = 'mp4'
    if (filename) {
      const dotIndex = filename.lastIndexOf('.')
      if (dotIndex >= 0) ext = filename.slice(dotIndex + 1).toLowerCase()
    }
    // Sanitize extension: strip any path separators
    ext = ext.replace(/[/\\]/g, '')

    const needsTranscode = !BROWSER_NATIVE_EXTENSIONS.has(ext)

    if (needsTranscode) {
      // Write buffer to temp file, transcode to MP4, then save
      console.log(`Transcoding video (${ext} -> mp4): ${filename}, size: ${file.buffer.length} bytes`)
      fs.writeFileSync(inputPath, file.buffer)
      await transcodeToMp4(inputPath, outputPath)

      const transcodedBuffer = fs.readFileSync(outputPath)
      // Save directly to scene folder with itemId
      const key = `${sceneFolder}/${itemId}.mp4`
      await save(key, transcodedBuffer, 'video/mp4')
      console.log(`Video transcoded and uploaded: ${key}`)

      const url = getPublicUrl(key)
      cleanup()
      res.json({ success: true, url, transcoded: true })
    } else {
      // Browser-native format — save as-is
      const contentType = file.mimetype
      // Save directly to scene folder with itemId
      const key = `${sceneFolder}/${itemId}.${ext}`

      console.log(`Uploading video: ${key}, size: ${file.buffer.length} bytes`)
      await save(key, file.buffer, contentType || 'video/mp4')
      console.log(`Video uploaded successfully: ${key}`)

      const url = getPublicUrl(key)
      res.json({ success: true, url })
    }
  } catch (error) {
    cleanup()
    console.error('Error uploading video:', error)
    res.status(500).json({ error: 'Failed to upload video' })
  }
})

// Crop an image and save the cropped version
router.post('/crop-image', async (req, res) => {
  try {
    const { sceneId, imageId, cropRect } = req.body
    if (!sceneId || !imageId) {
      return res.status(400).json({ error: 'sceneId and imageId are required' })
    }
    if (!cropRect) {
      return res.status(400).json({ error: 'cropRect is required' })
    }

    const { x, y, width, height } = cropRect

    // Construct the source image key from scene and image IDs
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`

    // Try common image extensions, track which one matched
    const extensions = ['png', 'jpg', 'jpeg', 'gif', 'webp']
    let buffer: Buffer | null = null
    let matchedExt = ''

    for (const ext of extensions) {
      const sourceKey = `${sceneFolder}/${imageId}.${ext}`
      buffer = await loadAsBuffer(sourceKey)
      if (buffer) {
        matchedExt = ext
        break
      }
    }

    if (!buffer) {
      return res.status(404).json({ error: 'Source image not found' })
    }

    let outputKey: string
    let contentType: string
    let outputSize: number = 0

    if (matchedExt === 'gif') {
      // Use ffmpeg with palette-preserving crop to keep animation
      const tempDir = os.tmpdir()
      const tempId = uuidv4()
      const gifInputPath = path.join(tempDir, `gif-crop-input-${tempId}.gif`)
      const gifOutputPath = path.join(tempDir, `gif-crop-output-${tempId}.gif`)

      const cleanupGif = () => {
        try { if (fs.existsSync(gifInputPath)) fs.unlinkSync(gifInputPath) } catch { /* ignore */ }
        try { if (fs.existsSync(gifOutputPath)) fs.unlinkSync(gifOutputPath) } catch { /* ignore */ }
      }

      try {
        fs.writeFileSync(gifInputPath, buffer)

        const cropW = Math.round(width)
        const cropH = Math.round(height)
        const cropX = Math.round(x)
        const cropY = Math.round(y)

        await new Promise<void>((resolve, reject) => {
          ffmpeg(gifInputPath)
            .complexFilter([
              `[0:v]crop=${cropW}:${cropH}:${cropX}:${cropY},split[s0][s1]`,
              '[s0]palettegen[p]',
              '[s1][p]paletteuse',
            ])
            .output(gifOutputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run()
        })

        const croppedGifBuffer = fs.readFileSync(gifOutputPath)
        outputKey = `${sceneFolder}/${imageId}.crop.gif`
        contentType = 'image/gif'
        outputSize = croppedGifBuffer.length
        await save(outputKey, croppedGifBuffer, contentType)
        cleanupGif()
      } catch (err) {
        cleanupGif()
        throw err
      }
    } else {
      // Non-GIF: crop with sharp as before
      const croppedBuffer = await sharp(buffer)
        .extract({ left: Math.round(x), top: Math.round(y), width: Math.round(width), height: Math.round(height) })
        .png()
        .toBuffer()

      outputKey = `${sceneFolder}/${imageId}.crop.png`
      contentType = 'image/png'
      outputSize = croppedBuffer.length
      await save(outputKey, croppedBuffer, contentType)
    }

    const url = getPublicUrl(outputKey)
    res.json({ success: true, url, fileSize: outputSize })
  } catch (error) {
    console.error('Error cropping image:', error)
    res.status(500).json({ error: 'Failed to crop image' })
  }
})

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
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
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

    // Use multi-pass approach when we have trim combined with crop or speed
    // This avoids synchronization issues between input seeking and video filters
    // Pass 1: crop + trim -> intermediate file (or output if no speed)
    // Pass 2: speed change -> output file (only if speed is needed)
    const needsTrimPass = hasTrim && (effectiveSpeed || cropRect)
    const needsSpeedPass = hasTrim && effectiveSpeed

    if (needsTrimPass) {
      // PASS 1: Crop and trim
      // Output to intermediate if we need speed pass, otherwise directly to output
      const pass1Output = needsSpeedPass ? intermediatePath : outputPath

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

        cmd.outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart'])

        if (removeAudio) {
          cmd.noAudio()
        } else {
          cmd.outputOptions(['-c:a', 'aac', '-b:a', '128k'])
        }

        cmd.output(pass1Output)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })

      // PASS 2: Apply speed change (only if needed)
      if (needsSpeedPass) {
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

          cmd.outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart'])
          cmd.output(outputPath)
            .on('end', () => resolve())
            .on('error', (err) => reject(err))
            .run()
        })
      }
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

        cmd.outputOptions(['-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart'])

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
    res.json({ success: true, fileSize: processedBuffer.length })
  } catch (error) {
    cleanup()
    console.error('Error processing video:', error)
    res.status(500).json({ error: 'Failed to process video' })
  }
})

// Convert media between video and GIF formats
router.post('/convert-media', async (req, res) => {
  const tempDir = os.tmpdir()
  const tempId = uuidv4()
  const inputPath = path.join(tempDir, `convert-input-${tempId}`)
  const outputPath = path.join(tempDir, `convert-output-${tempId}`)

  const cleanup = () => {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath) } catch { /* ignore */ }
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath) } catch { /* ignore */ }
  }

  try {
    const { sceneId, itemId, targetFormat, isEdit, extension } = req.body
    if (!sceneId || !itemId) {
      return res.status(400).json({ error: 'sceneId and itemId are required' })
    }
    if (!uuidValidate(sceneId) || !uuidValidate(itemId)) {
      return res.status(400).json({ error: 'Invalid scene ID or item ID format' })
    }
    if (targetFormat !== 'gif' && targetFormat !== 'mp4') {
      return res.status(400).json({ error: 'targetFormat must be "gif" or "mp4"' })
    }
    if (!extension) {
      return res.status(400).json({ error: 'extension is required' })
    }

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const sourceKey = `${sceneFolder}/${itemId}${isEdit ? '.crop' : ''}.${extension}`

    // Load source file from storage
    const sourceBuffer = await loadAsBuffer(sourceKey)
    if (!sourceBuffer) {
      return res.status(404).json({ error: 'Source file not found' })
    }

    // Write source to temp file
    const inputExt = extension
    const inputFile = `${inputPath}.${inputExt}`
    const outputExt = targetFormat === 'gif' ? 'gif' : 'mp4'
    const outputFile = `${outputPath}.${outputExt}`
    fs.writeFileSync(inputFile, sourceBuffer)

    if (targetFormat === 'gif') {
      // Video → GIF: palette-preserving conversion
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputFile)
          .complexFilter([
            '[0:v]split[s0][s1]',
            '[s0]palettegen[p]',
            '[s1][p]paletteuse',
          ])
          .output(outputFile)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })
    } else {
      // GIF → MP4: H.264 encode
      await new Promise<void>((resolve, reject) => {
        ffmpeg(inputFile)
          .outputOptions([
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-movflags', '+faststart',
            '-pix_fmt', 'yuv420p',
          ])
          .noAudio()
          .output(outputFile)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .run()
      })
    }

    // Get output dimensions using ffprobe
    const { width, height } = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      ffmpeg.ffprobe(outputFile, (err, metadata) => {
        if (err) return reject(err)
        const videoStream = metadata.streams.find(s => s.codec_type === 'video')
        if (!videoStream?.width || !videoStream?.height) {
          return reject(new Error('Could not determine output dimensions'))
        }
        resolve({ width: videoStream.width, height: videoStream.height })
      })
    })

    // Save converted file with new item ID
    const newItemId = uuidv4()
    const outputKey = `${sceneFolder}/${newItemId}.${outputExt}`
    const outputBuffer = fs.readFileSync(outputFile)
    const contentType = targetFormat === 'gif' ? 'image/gif' : 'video/mp4'
    await save(outputKey, outputBuffer, contentType)

    const url = getPublicUrl(outputKey)

    // Clean up temp files (with extensions)
    try { if (fs.existsSync(inputFile)) fs.unlinkSync(inputFile) } catch { /* ignore */ }
    try { if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile) } catch { /* ignore */ }

    res.json({ success: true, url, newItemId, width, height, fileSize: outputBuffer.length })
  } catch (error) {
    cleanup()
    // Also try cleaning up files with extensions
    try { fs.readdirSync(os.tmpdir()).filter(f => f.includes(tempId)).forEach(f => fs.unlinkSync(path.join(os.tmpdir(), f))) } catch { /* ignore */ }
    console.error('Error converting media:', error)
    res.status(500).json({ error: 'Failed to convert media' })
  }
})

export default router
