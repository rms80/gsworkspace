import { useState, useEffect, useRef } from 'react'
import { CanvasItem, VideoItem } from '../types'
import { commitGifPreview, VideoGifPreview } from '../api/videos'
import { discardGifPreview } from '../api/images'
import { renderGifConversionPreview } from '../utils/sceneOperations'
import { videoDisplayPixelSize } from '../utils/videoBake'
import { useModalCapture } from './useModalCapture'

interface UseVideoToGifModeParams {
  items: CanvasItem[]
  sceneId: string
  onAddImageAt: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, originalWidth?: number, originalHeight?: number, fileSize?: number) => void
  onSelectItems: (ids: string[]) => void
}

export interface VideoToGifSession {
  videoId: string
  /** Pixel size of the source (after its crop) */
  sourceWidth: number
  sourceHeight: number
  /** Canvas placement of the preview, and of the created GIF */
  rect: { x: number; y: number; width: number; height: number }
  name: string
  fps: number
  scale: number
  /** Nearest-neighbour sampling when scaling up */
  nearest: boolean
  /** The GIF rendered with the current settings; null while rendering */
  preview: VideoGifPreview | null
  previewing: boolean
  creating: boolean
  error: string | null
}

export interface VideoToGifMode {
  session: VideoToGifSession | null
  start: (videoId: string) => void
  setFps: (fps: number) => void
  setScale: (scale: number) => void
  setNearest: (nearest: boolean) => void
  finalize: () => void
  cancel: () => void
}

export const GIF_MIN_FPS = 1
export const GIF_MAX_FPS = 50
export const GIF_MIN_SCALE = 0.05
export const GIF_MAX_SCALE = 8
const DEFAULT_FPS = 10
const PREVIEW_DEBOUNCE_MS = 300

/** Output pixel size for a source size and scale (matches the server's rounding) */
export function gifOutputSize(width: number, height: number, scale: number) {
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/**
 * Convert to GIF (from a video) as a modal tool with frame rate and scale settings. The actual GIF is
 * rendered on the server whenever the settings change, and Create keeps the rendered GIF.
 */
export function useVideoToGifMode({ items, sceneId, onAddImageAt, onSelectItems }: UseVideoToGifModeParams): VideoToGifMode {
  const [session, setSession] = useState<VideoToGifSession | null>(null)
  // Incremented whenever a preview render is superseded (new settings, finalize, cancel)
  const previewSeqRef = useRef(0)
  // Aborting the request also makes the server stop the render
  const previewAbortRef = useRef<AbortController | null>(null)
  // The preview currently shown, so it can be discarded when replaced or the session ends
  const previewIdRef = useRef<string | null>(null)

  const stopPreviewRender = () => {
    previewSeqRef.current++
    previewAbortRef.current?.abort()
    previewAbortRef.current = null
  }

  const discardCurrentPreview = () => {
    const previewId = previewIdRef.current
    previewIdRef.current = null
    if (previewId) discardGifPreview(previewId)
  }

  const start = (videoId: string) => {
    const video = items.find((i): i is VideoItem => i.id === videoId && i.type === 'video')
    if (!video) return
    const { width: sourceWidth, height: sourceHeight } = videoDisplayPixelSize(video)
    const visualWidth = video.width * (video.scaleX ?? 1)
    const visualHeight = video.height * (video.scaleY ?? 1)
    stopPreviewRender()
    discardCurrentPreview()
    setSession({
      videoId,
      sourceWidth,
      sourceHeight,
      // Where the GIF will be created: to the right of the video, at its displayed size
      rect: { x: video.x + visualWidth + 20, y: video.y, width: visualWidth, height: visualHeight },
      name: `${video.name || 'Video'}_gif`,
      fps: DEFAULT_FPS,
      scale: 1,
      nearest: false,
      preview: null,
      previewing: true,
      creating: false,
      error: null,
    })
  }

  const setFps = (fps: number) => {
    setSession((s) => s && { ...s, fps: Math.max(GIF_MIN_FPS, Math.min(GIF_MAX_FPS, Math.round(fps))) })
  }

  const setScale = (scale: number) => {
    setSession((s) => s && { ...s, scale: Math.max(GIF_MIN_SCALE, Math.min(GIF_MAX_SCALE, Math.round(scale * 100) / 100)) })
  }

  const setNearest = (nearest: boolean) => setSession((s) => s && { ...s, nearest })

  const cancel = () => {
    stopPreviewRender()
    discardCurrentPreview()
    setSession(null)
  }

  const finalize = async () => {
    if (!session || session.creating || !session.preview) return
    const s = session
    const preview = s.preview!
    stopPreviewRender()
    // Committing moves the preview into the scene, so it must not be discarded
    previewIdRef.current = null
    setSession({ ...s, creating: true })
    try {
      const result = await commitGifPreview(sceneId, preview.previewId)
      onAddImageAt(result.newItemId, s.rect.x + s.rect.width / 2, s.rect.y, result.url, s.rect.width, s.rect.height, s.name, preview.width, preview.height, result.fileSize)
      onSelectItems([result.newItemId])
    } catch (err) {
      console.error('Failed to convert video to GIF:', err)
      alert(`Failed to convert video to GIF: ${err instanceof Error ? err.message : err}`)
      discardGifPreview(preview.previewId)
    } finally {
      setSession(null)
    }
  }

  // Re-render the GIF (debounced) whenever the settings change. Nearest only changes the output
  // when scaling up.
  const settingsKey = session && !session.creating
    ? `${session.videoId}|${session.fps}|${session.scale}|${session.nearest && session.scale > 1}`
    : null
  useEffect(() => {
    if (!session || settingsKey === null) return
    stopPreviewRender()
    const seq = previewSeqRef.current
    const { videoId, fps, scale } = session
    const nearest = session.nearest && scale > 1
    // The previous GIF no longer matches the settings
    discardCurrentPreview()
    setSession((s) => s && { ...s, preview: null, previewing: true, error: null })
    const timer = setTimeout(async () => {
      const video = items.find((i): i is VideoItem => i.id === videoId && i.type === 'video')
      if (!video) return
      const abort = new AbortController()
      previewAbortRef.current = abort
      try {
        const result = await renderGifConversionPreview(sceneId, video, { fps, scale, nearest }, abort.signal)
        if (seq !== previewSeqRef.current) {
          // Superseded while rendering
          discardGifPreview(result.previewId)
          return
        }
        previewIdRef.current = result.previewId
        setSession((cur) => cur && { ...cur, preview: result, previewing: false })
      } catch (err) {
        if (seq !== previewSeqRef.current || abort.signal.aborted) return
        console.error('Failed to render GIF preview:', err)
        setSession((cur) => cur && { ...cur, previewing: false, error: err instanceof Error ? err.message : 'Preview failed' })
      }
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [settingsKey, sceneId])

  // The session is modal: Escape cancels and app shortcuts are blocked
  useModalCapture(!!session, cancel)

  // Stop rendering and discard the preview if the canvas unmounts mid-session
  useEffect(() => () => {
    stopPreviewRender()
    discardCurrentPreview()
  }, [])

  return { session, start, setFps, setScale, setNearest, finalize, cancel }
}
