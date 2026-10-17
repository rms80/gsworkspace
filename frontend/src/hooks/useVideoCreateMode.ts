import { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CanvasItem, VideoItem } from '../types'
import { ClipTransition, ConcatClip, OutputResolution, createVideo, createVideoPreview, discardVideoPreview } from '../api/videoTools'
import { hasVideoEdits, videoDisplayPixelSize } from '../utils/videoBake'
import { useModalCapture } from './useModalCapture'

interface UseVideoCreateModeParams {
  items: CanvasItem[]
  sceneId: string
  onAddVideoAt: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, fileSize?: number, originalWidth?: number, originalHeight?: number) => void
  onSelectItems: (ids: string[]) => void
}

export interface VideoCreateSession {
  /** Clip video ids, in selection order */
  ids: string[]
  clips: ConcatClip[]
  names: string[]
  /** Transition between each pair of consecutive clips */
  transitions: ClipTransition[]
  /** Length of cross-fade / dip-to-black transitions, in seconds */
  transitionDuration: number
  /** Pixel size of each clip (as shown, i.e. after its crop) */
  clipSizes: { width: number; height: number }[]
  /** Output size mode: largest clip width × height, or the first clip's size */
  resolution: OutputResolution
  /** Output resolution (clips are scaled to fit and letterboxed into it) */
  width: number
  height: number
  /** Canvas placement of the preview, and of the created video */
  rect: { x: number; y: number; width: number; height: number }
  name: string
  previewUrl: string | null
  previewing: boolean
  creating: boolean
  error: string | null
  /** From the latest preview render */
  duration: number | null
  clipDurations: number[] | null
}

export interface VideoCreateMode {
  session: VideoCreateSession | null
  start: (ids: string[]) => void
  setTransition: (index: number, transition: ClipTransition) => void
  setTransitionDuration: (seconds: number) => void
  setResolution: (resolution: OutputResolution) => void
  finalize: () => void
  cancel: () => void
}

export const MAX_TRANSITION_SECONDS = 10
const DEFAULT_TRANSITION_SECONDS = 0.5
const PREVIEW_DEBOUNCE_MS = 400

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** Output size for the given mode (matches the server's calculation) */
function outputSize(clipSizes: { width: number; height: number }[], resolution: OutputResolution) {
  const sources = resolution === 'first' ? clipSizes.slice(0, 1) : clipSizes
  return {
    width: even(Math.max(...sources.map((s) => s.width))),
    height: even(Math.max(...sources.map((s) => s.height))),
  }
}

export function useVideoCreateMode({ items, sceneId, onAddVideoAt, onSelectItems }: UseVideoCreateModeParams): VideoCreateMode {
  const [session, setSession] = useState<VideoCreateSession | null>(null)
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
    if (previewId) discardVideoPreview(previewId)
  }

  const start = (ids: string[]) => {
    const videos = ids
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is VideoItem => i?.type === 'video')
    if (videos.length < 2) return

    const clipSizes = videos.map(videoDisplayPixelSize)
    const resolution: OutputResolution = 'first'
    const { width, height } = outputSize(clipSizes, resolution)
    const first = videos[0]
    const displayWidth = first.width * (first.scaleX ?? 1)

    // Place the preview to the right of the selection, as wide as the first clip is displayed
    const right = Math.max(...videos.map((v) => v.x + v.width * (v.scaleX ?? 1)))
    const top = Math.min(...videos.map((v) => v.y))

    stopPreviewRender()
    discardCurrentPreview()
    setSession({
      ids: videos.map((v) => v.id),
      clips: videos.map((v) => {
        const useEdited = hasVideoEdits(v)
        return { videoId: v.id, useEdited, version: useEdited ? v.cropSrc ?? 'unrendered' : 'original' }
      }),
      names: videos.map((v, i) => v.name || `Clip ${i + 1}`),
      transitions: videos.slice(1).map(() => 'cut' as ClipTransition),
      transitionDuration: DEFAULT_TRANSITION_SECONDS,
      clipSizes,
      resolution,
      width,
      height,
      rect: { x: right + 20, y: top, width: displayWidth, height: (displayWidth * height) / width },
      name: `${first.name || 'Video'}_combined`,
      previewUrl: null,
      previewing: true,
      creating: false,
      error: null,
      duration: null,
      clipDurations: null,
    })
  }

  const setTransition = (index: number, transition: ClipTransition) => {
    setSession((s) => s && { ...s, transitions: s.transitions.map((t, i) => (i === index ? transition : t)) })
  }

  const setTransitionDuration = (seconds: number) => {
    const clamped = Math.max(0, Math.min(MAX_TRANSITION_SECONDS, seconds))
    setSession((s) => s && { ...s, transitionDuration: Math.round(clamped * 100) / 100 })
  }

  const setResolution = (resolution: OutputResolution) => {
    setSession((s) => {
      if (!s) return s
      const { width, height } = outputSize(s.clipSizes, resolution)
      // Keep the preview's width; its height follows the new output aspect ratio
      return { ...s, resolution, width, height, rect: { ...s.rect, height: (s.rect.width * height) / width } }
    })
  }

  const cancel = () => {
    stopPreviewRender()
    discardCurrentPreview()
    setSession(null)
  }

  const finalize = async () => {
    if (!session || session.creating) return
    const s = session
    stopPreviewRender()
    setSession({ ...s, creating: true })
    const newId = uuidv4()
    try {
      const result = await createVideo({
        sceneId, clips: s.clips, transitions: s.transitions, transitionDuration: s.transitionDuration,
        resolution: s.resolution, newVideoId: newId,
      })
      onAddVideoAt(newId, s.rect.x + s.rect.width / 2, s.rect.y, result.url, s.rect.width, s.rect.height, s.name, result.fileSize, result.width, result.height)
      onSelectItems([newId])
    } catch (err) {
      console.error('Failed to create video:', err)
      alert(`Failed to create video: ${err instanceof Error ? err.message : err}`)
    } finally {
      discardCurrentPreview()
      setSession(null)
    }
  }

  // Re-render the preview (debounced) whenever the settings change
  const settingsKey = session && !session.creating
    ? `${session.ids.join(',')}|${session.transitions.join(',')}|${session.transitionDuration}|${session.resolution}`
    : null
  useEffect(() => {
    if (!session || settingsKey === null) return
    stopPreviewRender()
    const seq = previewSeqRef.current
    const { clips, transitions, transitionDuration, resolution } = session
    setSession((s) => s && { ...s, previewing: true })
    const timer = setTimeout(async () => {
      const abort = new AbortController()
      previewAbortRef.current = abort
      try {
        const result = await createVideoPreview({ sceneId, clips, transitions, transitionDuration, resolution }, abort.signal)
        if (seq !== previewSeqRef.current) {
          // Superseded while rendering
          discardVideoPreview(result.previewId)
          return
        }
        discardCurrentPreview()
        previewIdRef.current = result.previewId
        setSession((cur) => cur && {
          ...cur, previewUrl: result.url, previewing: false, error: null,
          duration: result.duration, clipDurations: result.clipDurations,
        })
      } catch (err) {
        if (seq !== previewSeqRef.current || abort.signal.aborted) return
        console.error('Failed to render video preview:', err)
        setSession((cur) => cur && { ...cur, previewing: false, error: err instanceof Error ? err.message : 'Preview failed' })
      }
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [settingsKey, sceneId])

  // The session is modal: Escape cancels and app shortcuts are blocked. Creating is done with the
  // panel's Create button.
  useModalCapture(!!session, cancel)

  // Stop rendering and discard the preview if the canvas unmounts mid-session
  useEffect(() => () => {
    stopPreviewRender()
    discardCurrentPreview()
  }, [])

  return { session, start, setTransition, setTransitionDuration, setResolution, finalize, cancel }
}
