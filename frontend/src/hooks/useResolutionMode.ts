import { useState, useEffect } from 'react'
import { CanvasItem, ImageItem, VideoItem } from '../types'
import { hasVideoEdits } from '../utils/videoBake'

interface UseResolutionModeParams {
  items: CanvasItem[]
  loadedImages: Map<string, HTMLImageElement>
  onSetResolutions?: (targets: { id: string; width: number; height: number }[], nearest: boolean) => void
}

export interface Size {
  width: number
  height: number
}

export interface ResolutionSession {
  /** Image/video ids in selection order; ids[0] is the reference shown in the panel */
  ids: string[]
  /** Current pixel resolution of each item */
  sizes: Size[]
  /** Per item: whether it's a video (H.264 needs even dimensions, lower size limit) */
  isVideo: boolean[]
  /** Which dimension was set last; the other follows each image's aspect ratio */
  mode: 'width' | 'height'
  value: number
  nearest: boolean
}

export interface ResolutionMode {
  session: ResolutionSession | null
  /** Resulting resolution of each image in the session */
  targets: Size[]
  /** Why the current targets can't be applied, if they can't */
  error: string | null
  start: (ids: string[]) => void
  setDimension: (mode: 'width' | 'height', value: number) => void
  setNearest: (nearest: boolean) => void
  apply: () => void
  cancel: () => void
}

export const MAX_RESOLUTION_DIMENSION = 16384
const MAX_RESOLUTION_PIXELS = 100_000_000
const MAX_VIDEO_DIMENSION = 8192

/** Target size for an item, keeping its aspect ratio. Videos are rounded to even dimensions. */
export function targetSize(size: Size, mode: 'width' | 'height', value: number, even = false): Size {
  const round = even ? (n: number) => Math.max(2, Math.round(n / 2) * 2) : (n: number) => Math.max(1, Math.round(n))
  return mode === 'width'
    ? { width: round(value), height: round((value * size.height) / size.width) }
    : { width: round((value * size.width) / size.height), height: round(value) }
}

export function useResolutionMode({ items, loadedImages, onSetResolutions }: UseResolutionModeParams): ResolutionMode {
  const [session, setSession] = useState<ResolutionSession | null>(null)

  const targets = session ? session.sizes.map((s, i) => targetSize(s, session.mode, session.value, session.isVideo[i])) : []
  const error = session && targets.some((t, i) => session.isVideo[i]
    ? t.width > MAX_VIDEO_DIMENSION || t.height > MAX_VIDEO_DIMENSION
    : t.width > MAX_RESOLUTION_DIMENSION || t.height > MAX_RESOLUTION_DIMENSION || t.width * t.height > MAX_RESOLUTION_PIXELS
  )
    ? session.isVideo.some(Boolean)
      ? `Max ${MAX_VIDEO_DIMENSION}px per side for video`
      : `Max ${MAX_RESOLUTION_DIMENSION}px per side, ${MAX_RESOLUTION_PIXELS / 1_000_000}M pixels total`
    : null

  const start = (ids: string[]) => {
    // Uncropped images and unedited videos (resizing is baked into the pixels)
    const media = ids
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is ImageItem | VideoItem =>
        (i?.type === 'image' && !i.cropRect) || (i?.type === 'video' && !hasVideoEdits(i)))
    const sizes = media.map((item) => {
      if (item.type === 'video') {
        return { width: item.originalWidth ?? item.width, height: item.originalHeight ?? item.height }
      }
      const el = loadedImages.get(item.src)
      return el ? { width: el.naturalWidth, height: el.naturalHeight } : null
    })
    if (media.length === 0 || sizes.some((s) => !s)) return
    const known = sizes as Size[]
    setSession({
      ids: media.map((i) => i.id),
      sizes: known,
      isVideo: media.map((i) => i.type === 'video'),
      mode: 'width',
      value: known[0].width,
      nearest: false,
    })
  }

  const setDimension = (mode: 'width' | 'height', value: number) => {
    setSession((s) => s && { ...s, mode, value: Math.max(1, Math.round(value)) })
  }

  const setNearest = (nearest: boolean) => {
    setSession((s) => s && { ...s, nearest })
  }

  const cancel = () => setSession(null)

  const apply = () => {
    if (!session || error) return
    // Only images whose resolution actually changes
    const changed = session.ids
      .map((id, i) => ({ id, ...targets[i], current: session.sizes[i] }))
      .filter((t) => t.width !== t.current.width || t.height !== t.current.height)
      .map(({ id, width, height }) => ({ id, width, height }))
    if (changed.length > 0) onSetResolutions?.(changed, session.nearest)
    setSession(null)
  }

  // Keyboard handler (Enter to apply, Escape to cancel)
  useEffect(() => {
    if (!session) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        apply()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [session, error, onSetResolutions])

  return { session, targets, error, start, setDimension, setNearest, apply, cancel }
}
