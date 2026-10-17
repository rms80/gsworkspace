import { useState, useEffect } from 'react'
import { CanvasItem } from '../types'

interface UseResolutionModeParams {
  items: CanvasItem[]
  loadedImages: Map<string, HTMLImageElement>
  onSetImageResolutions?: (targets: { id: string; width: number; height: number }[], nearest: boolean) => void
}

export interface Size {
  width: number
  height: number
}

export interface ResolutionSession {
  /** Image ids in selection order; ids[0] is the reference shown in the panel */
  ids: string[]
  /** Current pixel resolution of each image */
  sizes: Size[]
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

/** Target size for an image, keeping its aspect ratio */
export function targetSize(size: Size, mode: 'width' | 'height', value: number): Size {
  return mode === 'width'
    ? { width: value, height: Math.max(1, Math.round((value * size.height) / size.width)) }
    : { width: Math.max(1, Math.round((value * size.width) / size.height)), height: value }
}

export function useResolutionMode({ items, loadedImages, onSetImageResolutions }: UseResolutionModeParams): ResolutionMode {
  const [session, setSession] = useState<ResolutionSession | null>(null)

  const targets = session ? session.sizes.map((s) => targetSize(s, session.mode, session.value)) : []
  const error = targets.some((t) =>
    t.width > MAX_RESOLUTION_DIMENSION || t.height > MAX_RESOLUTION_DIMENSION || t.width * t.height > MAX_RESOLUTION_PIXELS
  )
    ? `Max ${MAX_RESOLUTION_DIMENSION}px per side, ${MAX_RESOLUTION_PIXELS / 1_000_000}M pixels total`
    : null

  const start = (ids: string[]) => {
    const images = ids
      .map((id) => items.find((i) => i.id === id))
      .filter((i) => i?.type === 'image' && !i.cropRect) as Extract<CanvasItem, { type: 'image' }>[]
    const sizes = images.map((img) => {
      const el = loadedImages.get(img.src)
      return el ? { width: el.naturalWidth, height: el.naturalHeight } : null
    })
    if (images.length === 0 || sizes.some((s) => !s)) return
    const known = sizes as Size[]
    setSession({
      ids: images.map((i) => i.id),
      sizes: known,
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
    if (changed.length > 0) onSetImageResolutions?.(changed, session.nearest)
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
  }, [session, error, onSetImageResolutions])

  return { session, targets, error, start, setDimension, setNearest, apply, cancel }
}
