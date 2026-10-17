import { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CanvasItem, ImageItem } from '../types'
import { createGif, createGifPreview, discardGifPreview, GifFrame } from '../api/images'
import { useModalCapture } from './useModalCapture'

interface UseGifCreateModeParams {
  items: CanvasItem[]
  sceneId: string
  loadedImages: Map<string, HTMLImageElement>
  onAddImageAt: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, originalWidth?: number, originalHeight?: number, fileSize?: number) => void
  onSelectItems: (ids: string[]) => void
}

export interface GifSession {
  /** Frame image ids, in selection order */
  ids: string[]
  frames: GifFrame[]
  /** Display time of each frame in ms */
  delays: number[]
  /** Output resolution (the first frame's, capped); other frames are letterboxed into it */
  width: number
  height: number
  /** Canvas placement of the preview, and of the created GIF */
  rect: { x: number; y: number; width: number; height: number }
  name: string
  previewUrl: string | null
  previewing: boolean
  creating: boolean
  error: string | null
}

export interface GifCreateMode {
  session: GifSession | null
  start: (ids: string[]) => void
  setDelay: (index: number, ms: number) => void
  setAllDelays: (ms: number) => void
  finalize: () => void
  cancel: () => void
}

export const GIF_MIN_DELAY_MS = 20
export const GIF_MAX_DELAY_MS = 60000
const DEFAULT_DELAY_MS = 250
const MAX_GIF_DIMENSION = 4096
const PREVIEW_DEBOUNCE_MS = 300

const clampDelay = (ms: number) => Math.max(GIF_MIN_DELAY_MS, Math.min(GIF_MAX_DELAY_MS, Math.round(ms)))

export function useGifCreateMode({ items, sceneId, loadedImages, onAddImageAt, onSelectItems }: UseGifCreateModeParams): GifCreateMode {
  const [session, setSession] = useState<GifSession | null>(null)
  // Incremented whenever a preview request is superseded (new timing, finalize, cancel)
  const previewSeqRef = useRef(0)
  // The preview currently shown, so it can be discarded when replaced or the session ends
  const previewIdRef = useRef<string | null>(null)

  const discardCurrentPreview = () => {
    const previewId = previewIdRef.current
    previewIdRef.current = null
    if (previewId) discardGifPreview(previewId).catch(() => {})
  }

  const start = (ids: string[]) => {
    const images = ids
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is ImageItem => i?.type === 'image')
    if (images.length < 2) return
    const first = images[0]
    const el = loadedImages.get(first.src)
    if (!el) return

    // Output resolution: the first frame's pixel size (its crop, if any), capped
    const srcW = first.cropRect ? Math.round(first.cropRect.width) : el.naturalWidth
    const srcH = first.cropRect ? Math.round(first.cropRect.height) : el.naturalHeight
    const cap = Math.min(1, MAX_GIF_DIMENSION / Math.max(srcW, srcH))

    // Place the preview to the right of the selection, at the first image's displayed size
    const right = Math.max(...images.map((i) => i.x + i.width * (i.scaleX ?? 1)))
    const top = Math.min(...images.map((i) => i.y))

    discardCurrentPreview()
    previewSeqRef.current++
    setSession({
      ids: images.map((i) => i.id),
      frames: images.map((i) => (i.cropRect ? { imageId: i.id, cropRect: i.cropRect } : { imageId: i.id })),
      delays: images.map(() => DEFAULT_DELAY_MS),
      width: Math.max(1, Math.round(srcW * cap)),
      height: Math.max(1, Math.round(srcH * cap)),
      rect: { x: right + 20, y: top, width: first.width * (first.scaleX ?? 1), height: first.height * (first.scaleY ?? 1) },
      name: `${first.name || 'Image'}_gif`,
      previewUrl: null,
      previewing: true,
      creating: false,
      error: null,
    })
  }

  const setDelay = (index: number, ms: number) => {
    setSession((s) => s && { ...s, delays: s.delays.map((d, i) => (i === index ? clampDelay(ms) : d)) })
  }

  const setAllDelays = (ms: number) => {
    setSession((s) => s && { ...s, delays: s.delays.map(() => clampDelay(ms)) })
  }

  const cancel = () => {
    previewSeqRef.current++
    discardCurrentPreview()
    setSession(null)
  }

  const finalize = async () => {
    if (!session || session.creating) return
    const s = session
    previewSeqRef.current++
    setSession({ ...s, creating: true })
    const newId = uuidv4()
    try {
      const result = await createGif({ sceneId, frames: s.frames, delays: s.delays, width: s.width, height: s.height, newImageId: newId })
      onAddImageAt(newId, s.rect.x + s.rect.width / 2, s.rect.y, result.url, s.rect.width, s.rect.height, s.name, result.width, result.height, result.fileSize)
      onSelectItems([newId])
    } catch (err) {
      console.error('Failed to create GIF:', err)
      alert(`Failed to create GIF: ${err instanceof Error ? err.message : err}`)
    } finally {
      discardCurrentPreview()
      setSession(null)
    }
  }

  // Regenerate the preview (debounced) whenever the frame timing changes
  const delaysKey = session && !session.creating ? session.delays.join(',') : null
  useEffect(() => {
    if (!session || delaysKey === null) return
    const seq = ++previewSeqRef.current
    const { frames, delays, width, height } = session
    setSession((s) => s && { ...s, previewing: true })
    const timer = setTimeout(async () => {
      try {
        const result = await createGifPreview({ sceneId, frames, delays, width, height })
        if (seq !== previewSeqRef.current) {
          // Superseded while generating
          discardGifPreview(result.previewId).catch(() => {})
          return
        }
        discardCurrentPreview()
        previewIdRef.current = result.previewId
        setSession((cur) => cur && { ...cur, previewUrl: result.url, previewing: false, error: null })
      } catch (err) {
        if (seq !== previewSeqRef.current) return
        console.error('Failed to create GIF preview:', err)
        setSession((cur) => cur && { ...cur, previewing: false, error: err instanceof Error ? err.message : 'Preview failed' })
      }
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [delaysKey, session?.ids.join(','), sceneId])

  // The session is modal: Escape cancels and app shortcuts are blocked. Creating is done with the
  // panel's Create button.
  useModalCapture(!!session, cancel)

  // Discard the preview if the canvas unmounts mid-session
  useEffect(() => () => discardCurrentPreview(), [])

  return { session, start, setDelay, setAllDelays, finalize, cancel }
}
