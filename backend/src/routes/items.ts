import { Router } from 'express'
import { save, loadAsBuffer, getPublicUrl, list, del } from '../services/storage.js'
import { applyVideoEdits, probeVideo } from '../services/videoProcessing.js'
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

// MIME types for text file formats
const TEXT_FILE_MIME_TYPES: Record<string, string> = {
  txt: 'text/plain', csv: 'text/csv', js: 'text/javascript', ts: 'text/typescript',
  tsx: 'text/typescript', cs: 'text/plain', cpp: 'text/plain', h: 'text/plain',
  c: 'text/plain', json: 'application/json', py: 'text/x-python',
  md: 'text/markdown', sh: 'text/x-shellscript', log: 'text/plain', ini: 'text/plain',
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
    const { imageData, sceneId, itemId, filename, isCrop } = req.body
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
    // When isCrop, write to the .crop.<ext> file the rest of the server expects
    // (crop-image produces this same naming).
    const key = isCrop
      ? `${sceneFolder}/${itemId}.crop.${ext}`
      : `${sceneFolder}/${itemId}.${ext}`

    // Strip the `data:...;base64,` prefix leniently — some clients may not
    // know the exact MIME type (e.g. blobs extracted from a zip).
    const base64Data = imageData.replace(/^data:[^,]*;base64,/, '')
    await save(key, Buffer.from(base64Data, 'base64'), `image/${ext}`)

    // Return the appropriate URL based on storage mode
    const url = getPublicUrl(key)

    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading image:', error)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

// Upload PDF
router.post('/upload-pdf', async (req, res) => {
  try {
    const { pdfData, sceneId, itemId, filename } = req.body
    if (!sceneId || !itemId) {
      return res.status(400).json({ error: 'sceneId and itemId are required' })
    }
    if (!uuidValidate(sceneId) || !uuidValidate(itemId)) {
      return res.status(400).json({ error: 'Invalid scene ID or item ID format' })
    }

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const key = `${sceneFolder}/${itemId}.pdf`

    const base64Data = pdfData.replace(/^data:[^,]*;base64,/, '')
    await save(key, Buffer.from(base64Data, 'base64'), 'application/pdf')

    const url = getPublicUrl(key)
    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading PDF:', error)
    res.status(500).json({ error: 'Failed to upload PDF' })
  }
})

// Upload text file (.txt, .csv, .js, .json, .py, .md, etc.)
router.post('/upload-textfile', async (req, res) => {
  try {
    const { textData, sceneId, itemId, filename, fileFormat } = req.body
    if (!sceneId || !itemId) {
      return res.status(400).json({ error: 'sceneId and itemId are required' })
    }
    if (!uuidValidate(sceneId) || !uuidValidate(itemId)) {
      return res.status(400).json({ error: 'Invalid scene ID or item ID format' })
    }

    const ext = fileFormat || 'txt'
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const key = `${sceneFolder}/${itemId}.${ext}`

    const base64Data = textData.replace(/^data:[^,]*;base64,/, '')
    const contentType = TEXT_FILE_MIME_TYPES[ext] || 'text/plain'
    await save(key, Buffer.from(base64Data, 'base64'), contentType)

    const url = getPublicUrl(key)
    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading text file:', error)
    res.status(500).json({ error: 'Failed to upload text file' })
  }
})

// Upload PDF thumbnail
router.post('/upload-pdf-thumbnail', async (req, res) => {
  try {
    const { imageData, sceneId, itemId } = req.body
    if (!sceneId || !itemId) {
      return res.status(400).json({ error: 'sceneId and itemId are required' })
    }
    if (!uuidValidate(sceneId) || !uuidValidate(itemId)) {
      return res.status(400).json({ error: 'Invalid scene ID or item ID format' })
    }

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const key = `${sceneFolder}/${itemId}.thumb.png`

    const base64Data = imageData.replace(/^data:[^,]*;base64,/, '')
    await save(key, Buffer.from(base64Data, 'base64'), 'image/png')

    const url = getPublicUrl(key)
    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading PDF thumbnail:', error)
    res.status(500).json({ error: 'Failed to upload PDF thumbnail' })
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
    // Multipart form fields arrive as strings
    const isCrop = req.body.isCrop === 'true' || req.body.isCrop === true

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

    // crop-video always outputs .crop.mp4, so the crop slot is always mp4 and
    // never needs transcoding on upload.
    const needsTranscode = !isCrop && !BROWSER_NATIVE_EXTENSIONS.has(ext)

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
      // Browser-native format (or pre-rendered crop) — save as-is
      const contentType = file.mimetype
      const cropExt = isCrop ? 'mp4' : ext
      const key = isCrop
        ? `${sceneFolder}/${itemId}.crop.${cropExt}`
        : `${sceneFolder}/${itemId}.${ext}`

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

// MIME types for 3D model formats
const MODEL3D_MIME_TYPES: Record<string, string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  obj: 'text/plain',
  stl: 'model/stl',
  fbx: 'application/octet-stream',
}

// Upload 3D model (multipart/form-data) — stored as-is, no transcoding
router.post('/upload-model3d', upload.single('model'), async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ error: 'No model file provided' })
    }

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
    let ext = 'glb'
    if (filename) {
      const dotIndex = filename.lastIndexOf('.')
      if (dotIndex >= 0) ext = filename.slice(dotIndex + 1).toLowerCase()
    }
    ext = ext.replace(/[/\\]/g, '')

    const key = `${sceneFolder}/${itemId}.${ext}`
    const contentType = MODEL3D_MIME_TYPES[ext] || 'application/octet-stream'

    console.log(`Uploading 3D model: ${key}, size: ${file.buffer.length} bytes`)
    await save(key, file.buffer, contentType)
    console.log(`3D model uploaded successfully: ${key}`)

    const url = getPublicUrl(key)
    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading 3D model:', error)
    res.status(500).json({ error: 'Failed to upload 3D model' })
  }
})

// MIME types for Gaussian splat formats
const SPLAT_MIME_TYPES: Record<string, string> = {
  splat: 'application/octet-stream',
  ksplat: 'application/octet-stream',
  ply: 'application/octet-stream',
}

// Upload Gaussian splat (multipart/form-data) — stored as-is
router.post('/upload-splat', upload.single('splat'), async (req, res) => {
  try {
    const file = req.file
    if (!file) {
      return res.status(400).json({ error: 'No splat file provided' })
    }

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

    let ext = 'splat'
    if (filename) {
      const dotIndex = filename.lastIndexOf('.')
      if (dotIndex >= 0) ext = filename.slice(dotIndex + 1).toLowerCase()
    }
    ext = ext.replace(/[/\\]/g, '')

    const key = `${sceneFolder}/${itemId}.${ext}`
    const contentType = SPLAT_MIME_TYPES[ext] || 'application/octet-stream'

    console.log(`Uploading splat: ${key}, size: ${file.buffer.length} bytes`)
    await save(key, file.buffer, contentType)
    console.log(`Splat uploaded successfully: ${key}`)

    const url = getPublicUrl(key)
    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading splat:', error)
    res.status(500).json({ error: 'Failed to upload splat' })
  }
})

interface CropRectInput {
  x: number
  y: number
  width: number
  height: number
}

/** Loads an image item's original file from its scene folder, trying common extensions. */
async function loadSourceImage(sceneFolder: string, imageId: string): Promise<{ buffer: Buffer; ext: string } | null> {
  for (const ext of ['png', 'jpg', 'jpeg', 'gif', 'webp']) {
    const buffer = await loadAsBuffer(`${sceneFolder}/${imageId}.${ext}`)
    if (buffer) return { buffer, ext }
  }
  return null
}

/**
 * Crops an image buffer. GIFs are cropped with ffmpeg (palette-preserving, keeps animation);
 * everything else is cropped with sharp and output as PNG.
 */
async function cropImageBuffer(
  buffer: Buffer,
  ext: string,
  cropRect: CropRectInput
): Promise<{ buffer: Buffer; ext: 'gif' | 'png'; contentType: string }> {
  const cropX = Math.round(cropRect.x)
  const cropY = Math.round(cropRect.y)
  const cropW = Math.round(cropRect.width)
  const cropH = Math.round(cropRect.height)

  if (ext !== 'gif') {
    const croppedBuffer = await sharp(buffer)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .png()
      .toBuffer()
    return { buffer: croppedBuffer, ext: 'png', contentType: 'image/png' }
  }

  const tempDir = os.tmpdir()
  const tempId = uuidv4()
  const gifInputPath = path.join(tempDir, `gif-crop-input-${tempId}.gif`)
  const gifOutputPath = path.join(tempDir, `gif-crop-output-${tempId}.gif`)

  try {
    fs.writeFileSync(gifInputPath, buffer)
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
    return { buffer: fs.readFileSync(gifOutputPath), ext: 'gif', contentType: 'image/gif' }
  } finally {
    try { if (fs.existsSync(gifInputPath)) fs.unlinkSync(gifInputPath) } catch { /* ignore */ }
    try { if (fs.existsSync(gifOutputPath)) fs.unlinkSync(gifOutputPath) } catch { /* ignore */ }
  }
}

/**
 * Resizes an image buffer to exactly width×height. GIFs are scaled with ffmpeg (keeps animation);
 * everything else with sharp, output as PNG. `nearest` uses nearest-neighbour sampling,
 * otherwise Lanczos.
 */
async function resizeImageBuffer(
  buffer: Buffer,
  ext: string,
  width: number,
  height: number,
  nearest: boolean
): Promise<{ buffer: Buffer; ext: 'gif' | 'png'; contentType: string }> {
  if (ext !== 'gif') {
    const resized = await sharp(buffer)
      .resize(width, height, { fit: 'fill', kernel: nearest ? 'nearest' : 'lanczos3' })
      .png()
      .toBuffer()
    return { buffer: resized, ext: 'png', contentType: 'image/png' }
  }

  const tempDir = os.tmpdir()
  const tempId = uuidv4()
  const gifInputPath = path.join(tempDir, `gif-resize-input-${tempId}.gif`)
  const gifOutputPath = path.join(tempDir, `gif-resize-output-${tempId}.gif`)

  try {
    fs.writeFileSync(gifInputPath, buffer)
    await new Promise<void>((resolve, reject) => {
      ffmpeg(gifInputPath)
        .complexFilter([
          `[0:v]scale=${width}:${height}:flags=${nearest ? 'neighbor' : 'lanczos'},split[s0][s1]`,
          '[s0]palettegen[p]',
          // Nearest keeps the source colours, so dithering would only add noise
          nearest ? '[s1][p]paletteuse=dither=none' : '[s1][p]paletteuse',
        ])
        .output(gifOutputPath)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })
    return { buffer: fs.readFileSync(gifOutputPath), ext: 'gif', contentType: 'image/gif' }
  } finally {
    try { if (fs.existsSync(gifInputPath)) fs.unlinkSync(gifInputPath) } catch { /* ignore */ }
    try { if (fs.existsSync(gifOutputPath)) fs.unlinkSync(gifOutputPath) } catch { /* ignore */ }
  }
}

const MAX_RESIZE_DIMENSION = 16384
const MAX_RESIZE_PIXELS = 100_000_000

function isValidCropRect(cropRect: unknown): cropRect is CropRectInput {
  if (!cropRect || typeof cropRect !== 'object') return false
  const { x, y, width, height } = cropRect as Record<string, unknown>
  return [x, y, width, height].every((v) => typeof v === 'number' && Number.isFinite(v)) &&
    (width as number) >= 1 && (height as number) >= 1
}

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

    // Construct the source image key from scene and image IDs
    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`

    const source = await loadSourceImage(sceneFolder, imageId)
    if (!source) {
      return res.status(404).json({ error: 'Source image not found' })
    }

    const cropped = await cropImageBuffer(source.buffer, source.ext, cropRect)
    const outputKey = `${sceneFolder}/${imageId}.crop.${cropped.ext}`
    await save(outputKey, cropped.buffer, cropped.contentType)

    const url = getPublicUrl(outputKey)
    res.json({ success: true, url, fileSize: cropped.buffer.length })
  } catch (error) {
    console.error('Error cropping image:', error)
    res.status(500).json({ error: 'Failed to crop image' })
  }
})

// Bake an image's crop: save the cropped pixels as the original file of a new image item.
// The source image is left untouched so the pre-bake item can still be restored (undo).
router.post('/bake-crop', async (req, res) => {
  try {
    const { sceneId, imageId, newImageId, cropRect } = req.body
    if (!sceneId || !imageId || !newImageId) {
      return res.status(400).json({ error: 'sceneId, imageId and newImageId are required' })
    }
    if (!uuidValidate(sceneId) || !uuidValidate(imageId) || !uuidValidate(newImageId)) {
      return res.status(400).json({ error: 'Invalid scene ID or image ID format' })
    }
    if (!isValidCropRect(cropRect)) {
      return res.status(400).json({ error: 'A valid cropRect is required' })
    }

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const source = await loadSourceImage(sceneFolder, imageId)
    if (!source) {
      return res.status(404).json({ error: 'Source image not found' })
    }

    const cropped = await cropImageBuffer(source.buffer, source.ext, cropRect)
    const outputKey = `${sceneFolder}/${newImageId}.${cropped.ext}`
    await save(outputKey, cropped.buffer, cropped.contentType)

    res.json({ success: true, url: getPublicUrl(outputKey), fileSize: cropped.buffer.length })
  } catch (error) {
    console.error('Error baking image crop:', error)
    res.status(500).json({ error: 'Failed to bake image crop' })
  }
})

// Resize an image to an exact resolution, saved as the original file of a new image item.
// The source image is left untouched so the pre-resize item can still be restored (undo).
router.post('/resize-image', async (req, res) => {
  try {
    const { sceneId, imageId, newImageId, width, height, nearest } = req.body
    if (!sceneId || !imageId || !newImageId) {
      return res.status(400).json({ error: 'sceneId, imageId and newImageId are required' })
    }
    if (!uuidValidate(sceneId) || !uuidValidate(imageId) || !uuidValidate(newImageId)) {
      return res.status(400).json({ error: 'Invalid scene ID or image ID format' })
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || width > MAX_RESIZE_DIMENSION || height > MAX_RESIZE_DIMENSION ||
        width * height > MAX_RESIZE_PIXELS) {
      return res.status(400).json({
        error: `width and height must be whole numbers from 1 to ${MAX_RESIZE_DIMENSION}, at most ${MAX_RESIZE_PIXELS} pixels in total`,
      })
    }

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const source = await loadSourceImage(sceneFolder, imageId)
    if (!source) {
      return res.status(404).json({ error: 'Source image not found' })
    }

    const resized = await resizeImageBuffer(source.buffer, source.ext, width, height, !!nearest)
    const outputKey = `${sceneFolder}/${newImageId}.${resized.ext}`
    await save(outputKey, resized.buffer, resized.contentType)

    res.json({ success: true, url: getPublicUrl(outputKey), fileSize: resized.buffer.length })
  } catch (error) {
    console.error('Error resizing image:', error)
    res.status(500).json({ error: 'Failed to resize image' })
  }
})

// --- Create GIF from image frames ---

const GIF_PREVIEW_PREFIX = 'temp/gif-previews/'
const GIF_PREVIEW_MAX_DIMENSION = 640
const GIF_PREVIEW_MAX_AGE_MS = 60 * 60 * 1000
const GIF_MAX_DIMENSION = 4096
const GIF_MAX_FRAMES = 500
const GIF_MIN_DELAY_MS = 20
const GIF_MAX_DELAY_MS = 60000
const GIF_PREVIEW_ID_RE = /^\d+-[0-9a-f-]{36}$/

// Prepared frames (cropped + fitted PNGs), so preview updates that only change timing are fast.
// Image files are immutable per item id, so entries never go stale. Map order gives LRU eviction.
const gifFrameCache = new Map<string, Buffer>()
const GIF_FRAME_CACHE_MAX = 64

interface GifFrameInput {
  imageId: string
  cropRect?: CropRectInput
}

/** Loads an image (first frame for animated sources), applies its crop and fits it into width×height */
async function prepareGifFrame(sceneFolder: string, frame: GifFrameInput, width: number, height: number): Promise<Buffer> {
  const cacheKey = JSON.stringify([sceneFolder, frame.imageId, frame.cropRect ?? null, width, height])
  const cached = gifFrameCache.get(cacheKey)
  if (cached) {
    gifFrameCache.delete(cacheKey)
    gifFrameCache.set(cacheKey, cached)
    return cached
  }

  const source = await loadSourceImage(sceneFolder, frame.imageId)
  if (!source) throw Object.assign(new Error(`Source image not found: ${frame.imageId}`), { status: 404 })

  let pipeline = sharp(source.buffer)
  if (frame.cropRect) {
    const { x, y, width: cw, height: ch } = frame.cropRect
    pipeline = pipeline.extract({ left: Math.round(x), top: Math.round(y), width: Math.round(cw), height: Math.round(ch) })
  }
  const buffer = await pipeline
    .resize(width, height, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .png()
    .toBuffer()

  gifFrameCache.set(cacheKey, buffer)
  while (gifFrameCache.size > GIF_FRAME_CACHE_MAX) {
    gifFrameCache.delete(gifFrameCache.keys().next().value!)
  }
  return buffer
}

/** Deletes GIF previews older than GIF_PREVIEW_MAX_AGE_MS (abandoned sessions). Best effort. */
async function cleanupOldGifPreviews(): Promise<void> {
  try {
    const cutoff = Date.now() - GIF_PREVIEW_MAX_AGE_MS
    for (const key of await list(GIF_PREVIEW_PREFIX)) {
      const created = parseInt(key.slice(GIF_PREVIEW_PREFIX.length), 10)
      if (Number.isFinite(created) && created < cutoff) await del(key)
    }
  } catch (err) {
    console.error('Failed to clean up old GIF previews:', err)
  }
}

// Build an animated GIF from image items, one frame per image with its own display time.
// Frames use each image's crop and are fitted (letterboxed, transparent) into width×height.
// preview=true writes a small temporary preview (returns previewId); otherwise the GIF is saved
// as the original file of a new image item (newImageId).
router.post('/create-gif', async (req, res) => {
  try {
    const { sceneId, frames, delays, width, height, preview, newImageId } = req.body
    if (!sceneId || !uuidValidate(sceneId)) {
      return res.status(400).json({ error: 'A valid sceneId is required' })
    }
    if (!Array.isArray(frames) || frames.length === 0 || frames.length > GIF_MAX_FRAMES ||
        !frames.every((f: GifFrameInput) => f && typeof f.imageId === 'string' && uuidValidate(f.imageId) &&
          (f.cropRect === undefined || isValidCropRect(f.cropRect)))) {
      return res.status(400).json({ error: `frames must be 1 to ${GIF_MAX_FRAMES} images with valid IDs` })
    }
    if (!Array.isArray(delays) || delays.length !== frames.length ||
        !delays.every((d: unknown) => Number.isInteger(d) && (d as number) >= GIF_MIN_DELAY_MS && (d as number) <= GIF_MAX_DELAY_MS)) {
      return res.status(400).json({ error: `delays must give each frame a whole number of ms from ${GIF_MIN_DELAY_MS} to ${GIF_MAX_DELAY_MS}` })
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < 1 || height < 1 || width > GIF_MAX_DIMENSION || height > GIF_MAX_DIMENSION) {
      return res.status(400).json({ error: `width and height must be whole numbers from 1 to ${GIF_MAX_DIMENSION}` })
    }
    if (!preview && (!newImageId || !uuidValidate(newImageId))) {
      return res.status(400).json({ error: 'A valid newImageId is required' })
    }

    // Previews are scaled down so they regenerate quickly
    const previewScale = preview ? Math.min(1, GIF_PREVIEW_MAX_DIMENSION / Math.max(width, height)) : 1
    const outW = Math.max(1, Math.round(width * previewScale))
    const outH = Math.max(1, Math.round(height * previewScale))

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const frameBuffers = await Promise.all(
      (frames as GifFrameInput[]).map((f) => prepareGifFrame(sceneFolder, f, outW, outH))
    )
    const gif = await sharp(frameBuffers, { join: { animated: true } })
      .gif({ delay: delays, loop: 0 })
      .toBuffer()

    if (preview) {
      await cleanupOldGifPreviews()
      const previewId = `${Date.now()}-${uuidv4()}`
      const key = `${GIF_PREVIEW_PREFIX}${previewId}.gif`
      await save(key, gif, 'image/gif')
      return res.json({ success: true, url: getPublicUrl(key), previewId })
    }

    const key = `${sceneFolder}/${newImageId}.gif`
    await save(key, gif, 'image/gif')
    res.json({ success: true, url: getPublicUrl(key), width: outW, height: outH, fileSize: gif.length })
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 404) {
      return res.status(404).json({ error: (error as Error).message })
    }
    console.error('Error creating GIF:', error)
    res.status(500).json({ error: 'Failed to create GIF' })
  }
})

// Discard a temporary GIF preview
router.post('/discard-gif-preview', async (req, res) => {
  try {
    const { previewId } = req.body
    if (typeof previewId !== 'string' || !GIF_PREVIEW_ID_RE.test(previewId)) {
      return res.status(400).json({ error: 'Invalid previewId' })
    }
    await del(`${GIF_PREVIEW_PREFIX}${previewId}.gif`)
    res.json({ success: true })
  } catch (error) {
    console.error('Error discarding GIF preview:', error)
    res.status(500).json({ error: 'Failed to discard GIF preview' })
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

    await applyVideoEdits(inputPath, outputPath, intermediatePath, { cropRect, speed, removeAudio, trim })

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

interface GifOptionsInput {
  fps?: number
  scale?: number
  nearest?: boolean
}

/** Validates optional video → GIF settings; returns an error message, or null when valid */
function validateGifOptions(gifOptions: GifOptionsInput | undefined): string | null {
  const fps = gifOptions?.fps
  const scale = gifOptions?.scale
  if (fps !== undefined && !(Number.isFinite(fps) && fps >= 1 && fps <= 50)) {
    return 'gifOptions.fps must be from 1 to 50'
  }
  if (scale !== undefined && !(Number.isFinite(scale) && scale >= 0.05 && scale <= 8)) {
    return 'gifOptions.scale must be from 0.05 to 8'
  }
  return null
}

/**
 * Video → GIF: palette-preserving conversion, optionally resampled to a frame rate and scaled.
 * Calls onCommand with the ffmpeg command so callers can kill it.
 */
function encodeGif(
  inputFile: string,
  outputFile: string,
  gifOptions: GifOptionsInput | undefined,
  onCommand?: (command: ffmpeg.FfmpegCommand) => void,
): Promise<void> {
  const preFilters: string[] = []
  if (gifOptions?.fps !== undefined) preFilters.push(`fps=${gifOptions.fps}`)
  const scale = gifOptions?.scale
  if (scale !== undefined && scale !== 1) {
    // Nearest-neighbour only applies when scaling up; scaling down is always smooth
    const flags = scale > 1 && gifOptions?.nearest ? 'neighbor' : 'lanczos'
    preFilters.push(`scale=w='max(1,round(iw*${scale}))':h='max(1,round(ih*${scale}))':flags=${flags}`)
  }
  return new Promise<void>((resolve, reject) => {
    const command = ffmpeg(inputFile)
      .complexFilter([
        `[0:v]${preFilters.length > 0 ? preFilters.join(',') + ',' : ''}split[s0][s1]`,
        '[s0]palettegen[p]',
        '[s1][p]paletteuse',
      ])
      .output(outputFile)
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
    onCommand?.(command)
    command.run()
  })
}

// Downloaded video sources for Convert to GIF previews, reused while the settings change.
// Map order gives LRU eviction; entries also expire so edits made later are picked up.
const GIF_PREVIEW_SOURCE_TTL_MS = 5 * 60 * 1000
const GIF_PREVIEW_SOURCE_MAX = 4
const gifPreviewSources = new Map<string, { file: string; duration: number; usedAt: number }>()

function pruneGifPreviewSources(): void {
  const cutoff = Date.now() - GIF_PREVIEW_SOURCE_TTL_MS
  for (const [key, source] of gifPreviewSources) {
    if (source.usedAt < cutoff || gifPreviewSources.size > GIF_PREVIEW_SOURCE_MAX) {
      try { fs.unlinkSync(source.file) } catch { /* ignore */ }
      gifPreviewSources.delete(key)
    }
  }
}

// Render a video → GIF conversion at full quality as a temporary preview (returns previewId).
// /commit-gif-preview then saves it as a new image item, so creating doesn't re-encode.
router.post('/video-gif-preview', async (req, res) => {
  let command: ffmpeg.FfmpegCommand | null = null
  // Stop encoding if the client gives up (settings changed, or the panel closed)
  res.on('close', () => {
    if (!res.writableFinished) command?.kill('SIGKILL')
  })
  const outputFile = path.join(os.tmpdir(), `video-gif-preview-${uuidv4()}.gif`)

  try {
    const { sceneId, itemId, isEdit, extension, gifOptions } = req.body
    if (!sceneId || !itemId || !extension) {
      return res.status(400).json({ error: 'sceneId, itemId and extension are required' })
    }
    if (!uuidValidate(sceneId) || !uuidValidate(itemId)) {
      return res.status(400).json({ error: 'Invalid scene ID or item ID format' })
    }
    if (!/^[a-z0-9]{1,5}$/i.test(extension)) {
      return res.status(400).json({ error: 'Invalid extension' })
    }
    const optionsError = validateGifOptions(gifOptions)
    if (optionsError) return res.status(400).json({ error: optionsError })

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const sourceKey = `${sceneFolder}/${itemId}${isEdit ? '.crop' : ''}.${extension}`

    pruneGifPreviewSources()
    let source = gifPreviewSources.get(sourceKey)
    if (source) {
      gifPreviewSources.delete(sourceKey)
    } else {
      const sourceBuffer = await loadAsBuffer(sourceKey)
      if (!sourceBuffer) {
        return res.status(404).json({ error: 'Source file not found' })
      }
      const file = path.join(os.tmpdir(), `video-gif-source-${uuidv4()}.${extension}`)
      fs.writeFileSync(file, sourceBuffer)
      const { duration } = await probeVideo(file)
      source = { file, duration, usedAt: 0 }
    }
    source.usedAt = Date.now()
    gifPreviewSources.set(sourceKey, source)

    await encodeGif(source.file, outputFile, gifOptions, (c) => { command = c })
    if (res.destroyed) return

    const gif = fs.readFileSync(outputFile)
    const { width, height, pages } = await sharp(gif).metadata()
    await cleanupOldGifPreviews()
    const previewId = `${Date.now()}-${uuidv4()}`
    const key = `${GIF_PREVIEW_PREFIX}${previewId}.gif`
    await save(key, gif, 'image/gif')
    res.json({
      success: true, url: getPublicUrl(key), previewId,
      width, height, frames: pages ?? 1, duration: source.duration, fileSize: gif.length,
    })
  } catch (error) {
    if (!res.headersSent && !res.destroyed) {
      console.error('Error rendering GIF preview:', error)
      res.status(500).json({ error: 'Failed to render GIF preview' })
    }
  } finally {
    try { fs.unlinkSync(outputFile) } catch { /* ignore */ }
  }
})

// Save a temporary GIF preview as the original file of a new image item, removing the preview
router.post('/commit-gif-preview', async (req, res) => {
  try {
    const { sceneId, previewId } = req.body
    if (!sceneId || !uuidValidate(sceneId)) {
      return res.status(400).json({ error: 'A valid sceneId is required' })
    }
    if (typeof previewId !== 'string' || !GIF_PREVIEW_ID_RE.test(previewId)) {
      return res.status(400).json({ error: 'Invalid previewId' })
    }
    const previewKey = `${GIF_PREVIEW_PREFIX}${previewId}.gif`
    const gif = await loadAsBuffer(previewKey)
    if (!gif) {
      return res.status(404).json({ error: 'Preview not found' })
    }

    const sceneFolder = `${(req.params as Record<string, string>).workspace}/${sceneId}`
    const newItemId = uuidv4()
    const key = `${sceneFolder}/${newItemId}.gif`
    await save(key, gif, 'image/gif')
    await del(previewKey)
    res.json({ success: true, url: getPublicUrl(key), newItemId, fileSize: gif.length })
  } catch (error) {
    console.error('Error committing GIF preview:', error)
    res.status(500).json({ error: 'Failed to save GIF' })
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
    const { sceneId, itemId, targetFormat, isEdit, extension, gifOptions } = req.body
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
    // Optional video → GIF settings: frame rate, uniform scale, nearest-neighbour upscaling
    const optionsError = validateGifOptions(gifOptions)
    if (optionsError) return res.status(400).json({ error: optionsError })

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
      await encodeGif(inputFile, outputFile, gifOptions)
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
