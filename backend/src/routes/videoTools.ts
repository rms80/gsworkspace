import { Router } from 'express'
import { validate as uuidValidate, v4 as uuidv4 } from 'uuid'
import ffmpeg from 'fluent-ffmpeg'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { save, loadAsBuffer, exists, getPublicUrl, list, del } from '../services/storage.js'
import {
  applyVideoEdits, hasVideoEdits, probeVideo, resizeVideo, buildConcatFilterGraph,
  VideoEdits, VideoProbe, ClipTransition,
} from '../services/videoProcessing.js'

/**
 * Video tools: duplicate (with edits), bake edits, set resolution, and create a video from clips.
 * Like the image bake operations, results that replace or add a video are saved as the original
 * file of a new item id, leaving the source files intact for undo.
 */
const router = Router({ mergeParams: true })

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'ogg', 'ogv', 'avi', 'mkv']
const MAX_VIDEO_DIMENSION = 8192
const PREVIEW_PREFIX = 'temp/video-previews/'
const PREVIEW_MAX_DIMENSION = 640
const PREVIEW_MAX_AGE_MS = 60 * 60 * 1000
const PREVIEW_ID_RE = /^\d+-[0-9a-f-]{36}$/
const MAX_CLIPS = 50
const TRANSITIONS: ClipTransition[] = ['cut', 'crossfade', 'dip']

const sceneFolderOf = (req: { params: unknown }, sceneId: string) =>
  `${(req.params as Record<string, string>).workspace}/${sceneId}`

const tempPath = (label: string, ext = 'mp4') => path.join(os.tmpdir(), `video-${label}-${uuidv4()}.${ext}`)

function removeFiles(...files: string[]) {
  for (const f of files) {
    try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch { /* ignore */ }
  }
}

/** Finds a video item's original file */
async function findVideoSource(sceneFolder: string, videoId: string): Promise<{ key: string; ext: string } | null> {
  for (const ext of VIDEO_EXTENSIONS) {
    const key = `${sceneFolder}/${videoId}.${ext}`
    if (await exists(key)) return { key, ext }
  }
  return null
}

/** Copies a stored file to a temp file for ffmpeg */
async function storageToTempFile(key: string, ext: string): Promise<string> {
  const buffer = await loadAsBuffer(key)
  if (!buffer) throw Object.assign(new Error(`File not found: ${key}`), { status: 404 })
  const file = tempPath('input', ext)
  fs.writeFileSync(file, buffer)
  return file
}

function parseEdits(body: Record<string, unknown>): VideoEdits {
  const edits = (body.edits ?? {}) as VideoEdits
  return {
    cropRect: edits.cropRect,
    speed: typeof edits.speed === 'number' ? edits.speed : undefined,
    removeAudio: !!edits.removeAudio,
    trim: edits.trim,
  }
}

function sendError(res: import('express').Response, error: unknown, message: string) {
  const status = (error as { status?: number }).status
  if (status === 404) return res.status(404).json({ error: (error as Error).message })
  console.error(`${message}:`, error)
  res.status(500).json({ error: message })
}

// Duplicate a video's files to a new item id: the original, plus the rendered edited version
// if requested, so the copy keeps the same edits without re-encoding.
router.post('/duplicate', async (req, res) => {
  try {
    const { sceneId, videoId, newVideoId, copyEdited } = req.body
    if (![sceneId, videoId, newVideoId].every((id) => typeof id === 'string' && uuidValidate(id))) {
      return res.status(400).json({ error: 'Valid sceneId, videoId and newVideoId are required' })
    }
    const sceneFolder = sceneFolderOf(req, sceneId)
    const source = await findVideoSource(sceneFolder, videoId)
    if (!source) return res.status(404).json({ error: 'Source video not found' })

    const original = await loadAsBuffer(source.key)
    if (!original) return res.status(404).json({ error: 'Source video not found' })
    const newKey = `${sceneFolder}/${newVideoId}.${source.ext}`
    await save(newKey, original, `video/${source.ext}`)

    let cropUrl: string | undefined
    let cropFileSize: number | undefined
    if (copyEdited) {
      const edited = await loadAsBuffer(`${sceneFolder}/${videoId}.crop.mp4`)
      if (edited) {
        const cropKey = `${sceneFolder}/${newVideoId}.crop.mp4`
        await save(cropKey, edited, 'video/mp4')
        cropUrl = getPublicUrl(cropKey)
        cropFileSize = edited.length
      }
    }

    res.json({ success: true, url: getPublicUrl(newKey), fileSize: original.length, cropUrl, cropFileSize })
  } catch (error) {
    sendError(res, error, 'Failed to duplicate video')
  }
})

// Bake a video's edits (trim, crop, speed, audio removal) into the original file of a new item
router.post('/bake-edits', async (req, res) => {
  const files: string[] = []
  try {
    const { sceneId, videoId, newVideoId } = req.body
    if (![sceneId, videoId, newVideoId].every((id) => typeof id === 'string' && uuidValidate(id))) {
      return res.status(400).json({ error: 'Valid sceneId, videoId and newVideoId are required' })
    }
    const edits = parseEdits(req.body)
    if (!hasVideoEdits(edits)) return res.status(400).json({ error: 'The video has no edits to bake' })

    const sceneFolder = sceneFolderOf(req, sceneId)
    const source = await findVideoSource(sceneFolder, videoId)
    if (!source) return res.status(404).json({ error: 'Source video not found' })

    const input = await storageToTempFile(source.key, source.ext)
    const intermediate = tempPath('intermediate')
    const output = tempPath('output')
    files.push(input, intermediate, output)

    await applyVideoEdits(input, output, intermediate, edits)
    const probe = await probeVideo(output)
    const buffer = fs.readFileSync(output)
    const key = `${sceneFolder}/${newVideoId}.mp4`
    await save(key, buffer, 'video/mp4')

    res.json({ success: true, url: getPublicUrl(key), width: probe.width, height: probe.height, fileSize: buffer.length })
  } catch (error) {
    sendError(res, error, 'Failed to bake video edits')
  } finally {
    removeFiles(...files)
  }
})

// Resize a video to an exact (even) resolution, saved as the original file of a new item
router.post('/resize', async (req, res) => {
  const files: string[] = []
  try {
    const { sceneId, videoId, newVideoId, width, height, nearest } = req.body
    if (![sceneId, videoId, newVideoId].every((id) => typeof id === 'string' && uuidValidate(id))) {
      return res.status(400).json({ error: 'Valid sceneId, videoId and newVideoId are required' })
    }
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2 ||
        width % 2 !== 0 || height % 2 !== 0 || width > MAX_VIDEO_DIMENSION || height > MAX_VIDEO_DIMENSION) {
      return res.status(400).json({ error: `width and height must be even whole numbers from 2 to ${MAX_VIDEO_DIMENSION}` })
    }

    const sceneFolder = sceneFolderOf(req, sceneId)
    const source = await findVideoSource(sceneFolder, videoId)
    if (!source) return res.status(404).json({ error: 'Source video not found' })

    const input = await storageToTempFile(source.key, source.ext)
    const output = tempPath('output')
    files.push(input, output)

    await resizeVideo(input, output, width, height, !!nearest)
    const buffer = fs.readFileSync(output)
    const key = `${sceneFolder}/${newVideoId}.mp4`
    await save(key, buffer, 'video/mp4')

    res.json({ success: true, url: getPublicUrl(key), fileSize: buffer.length })
  } catch (error) {
    sendError(res, error, 'Failed to resize video')
  } finally {
    removeFiles(...files)
  }
})

// --- Create Video (append clips with transitions) ---

// Downloaded + probed clip inputs, reused across preview renders. Keyed by storage key and a
// client-supplied version (edited files are re-rendered in place, so their URL changes).
const clipCache = new Map<string, { path: string; probe: VideoProbe }>()
const CLIP_CACHE_MAX = 12

async function loadClip(sceneFolder: string, clip: { videoId: string; useEdited: boolean; version: string }) {
  let key: string
  let ext: string
  if (clip.useEdited) {
    key = `${sceneFolder}/${clip.videoId}.crop.mp4`
    ext = 'mp4'
    if (!(await exists(key))) {
      throw Object.assign(new Error('An edited clip has not finished processing yet'), { status: 404 })
    }
  } else {
    const source = await findVideoSource(sceneFolder, clip.videoId)
    if (!source) throw Object.assign(new Error(`Source video not found: ${clip.videoId}`), { status: 404 })
    key = source.key
    ext = source.ext
  }

  const cacheKey = `${key}|${clip.version}`
  const cached = clipCache.get(cacheKey)
  if (cached && fs.existsSync(cached.path)) {
    clipCache.delete(cacheKey)
    clipCache.set(cacheKey, cached)
    return cached
  }

  const file = await storageToTempFile(key, ext)
  const entry = { path: file, probe: await probeVideo(file) }
  clipCache.set(cacheKey, entry)
  while (clipCache.size > CLIP_CACHE_MAX) {
    const [oldKey, old] = clipCache.entries().next().value!
    clipCache.delete(oldKey)
    removeFiles(old.path)
  }
  return entry
}

async function cleanupOldPreviews(): Promise<void> {
  try {
    const cutoff = Date.now() - PREVIEW_MAX_AGE_MS
    for (const key of await list(PREVIEW_PREFIX)) {
      const created = parseInt(key.slice(PREVIEW_PREFIX.length), 10)
      if (Number.isFinite(created) && created < cutoff) await del(key)
    }
  } catch (err) {
    console.error('Failed to clean up old video previews:', err)
  }
}

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

// Append clips into one video with a transition between each pair. The output is the first
// clip's size, or the largest clip width × largest clip height (resolution: 'largest'); each clip
// is uniformly scaled to fit and letterboxed in black.
// preview=true renders a fast, reduced-resolution temporary preview (cancelled if the client
// disconnects); otherwise a high-quality render is saved as the original file of newVideoId.
router.post('/concat', async (req, res) => {
  const output = tempPath('concat')
  let command: ffmpeg.FfmpegCommand | null = null
  let aborted = false
  res.on('close', () => {
    if (!res.writableFinished && command) {
      aborted = true
      command.kill('SIGKILL')
    }
  })

  try {
    const { sceneId, clips, transitions, transitionDuration, preview, newVideoId, resolution = 'first' } = req.body
    if (typeof sceneId !== 'string' || !uuidValidate(sceneId)) {
      return res.status(400).json({ error: 'A valid sceneId is required' })
    }
    if (!Array.isArray(clips) || clips.length < 2 || clips.length > MAX_CLIPS ||
        !clips.every((c) => c && typeof c.videoId === 'string' && uuidValidate(c.videoId))) {
      return res.status(400).json({ error: `clips must be 2 to ${MAX_CLIPS} videos with valid IDs` })
    }
    if (!Array.isArray(transitions) || transitions.length !== clips.length - 1 ||
        !transitions.every((t) => TRANSITIONS.includes(t))) {
      return res.status(400).json({ error: `transitions must give one of ${TRANSITIONS.join(', ')} between each pair of clips` })
    }
    const tDuration = Number(transitionDuration)
    if (!Number.isFinite(tDuration) || tDuration < 0 || tDuration > 10) {
      return res.status(400).json({ error: 'transitionDuration must be 0 to 10 seconds' })
    }
    if (!preview && (typeof newVideoId !== 'string' || !uuidValidate(newVideoId))) {
      return res.status(400).json({ error: 'A valid newVideoId is required' })
    }
    if (resolution !== 'largest' && resolution !== 'first') {
      return res.status(400).json({ error: 'resolution must be "largest" or "first"' })
    }

    const sceneFolder = sceneFolderOf(req, sceneId)
    const loaded = []
    for (const c of clips) {
      loaded.push(await loadClip(sceneFolder, { videoId: c.videoId, useEdited: !!c.useEdited, version: String(c.version ?? '') }))
    }

    // Output size: the first clip's, or the largest clip width × largest clip height
    const sizeSources = resolution === 'first' ? [loaded[0]] : loaded
    const fullW = even(Math.max(...sizeSources.map((c) => c.probe.width)))
    const fullH = even(Math.max(...sizeSources.map((c) => c.probe.height)))
    const scale = preview ? Math.min(1, PREVIEW_MAX_DIMENSION / Math.max(fullW, fullH)) : 1
    const width = even(fullW * scale)
    const height = even(fullH * scale)
    const fps = Math.min(60, Math.max(1, Math.round(loaded[0].probe.fps)))

    const { graph, outputs, duration } = buildConcatFilterGraph(
      loaded, transitions, tDuration, width, height, fps, preview ? 'bilinear' : 'lanczos'
    )

    command = ffmpeg()
    for (const c of loaded) command.input(c.path)
    command
      .complexFilter(graph, outputs)
      .outputOptions([
        '-c:v', 'libx264',
        '-preset', preview ? 'ultrafast' : 'medium',
        '-crf', preview ? '30' : '18',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        ...(outputs.length > 1 ? ['-c:a', 'aac', '-b:a', preview ? '96k' : '192k'] : []),
      ])
    await new Promise<void>((resolve, reject) => {
      command!.output(output)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .run()
    })

    const buffer = fs.readFileSync(output)
    if (preview) {
      await cleanupOldPreviews()
      const previewId = `${Date.now()}-${uuidv4()}`
      const key = `${PREVIEW_PREFIX}${previewId}.mp4`
      await save(key, buffer, 'video/mp4')
      return res.json({
        success: true, url: getPublicUrl(key), previewId, width, height, duration,
        clipDurations: loaded.map((c) => c.probe.duration),
      })
    }

    const key = `${sceneFolder}/${newVideoId}.mp4`
    await save(key, buffer, 'video/mp4')
    res.json({ success: true, url: getPublicUrl(key), width, height, duration, fileSize: buffer.length })
  } catch (error) {
    if (aborted) return
    sendError(res, error, 'Failed to create video')
  } finally {
    removeFiles(output)
  }
})

// Discard a temporary Create Video preview
router.post('/discard-preview', async (req, res) => {
  try {
    const { previewId } = req.body
    if (typeof previewId !== 'string' || !PREVIEW_ID_RE.test(previewId)) {
      return res.status(400).json({ error: 'Invalid previewId' })
    }
    await del(`${PREVIEW_PREFIX}${previewId}.mp4`)
    res.json({ success: true })
  } catch (error) {
    console.error('Error discarding video preview:', error)
    res.status(500).json({ error: 'Failed to discard video preview' })
  }
})

export default router
