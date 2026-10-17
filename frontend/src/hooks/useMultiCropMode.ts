import { useState, useEffect, useRef } from 'react'
import { CanvasItem, CropRect, ImageItem } from '../types'
import { TransformEntry } from '../history'
import { cropImage } from '../api/images'
import { computeCropChanges } from '../utils/imageCrop'
import { loadGrayImage, estimateShift, computeCompatibleBounds, GrayImage, Shift } from '../utils/imageAlignment'

interface UseMultiCropModeParams {
  items: CanvasItem[]
  sceneId: string
  loadedImages: Map<string, HTMLImageElement>
  isOffline: boolean
  onUpdateItem: (id: string, changes: Partial<CanvasItem>, skipHistory?: boolean) => void
  onBatchTransform?: (entries: TransformEntry[]) => void
}

export interface MultiCropSession {
  /** Image ids in selection order; ids[0] is the reference image */
  ids: string[]
  status: 'aligning' | 'ready'
  progress: string
  /** Per image: reference pixel (x, y) corresponds to (x + dx, y + dy) in that image */
  shifts: Shift[]
  /** Largest crop region (in reference pixels) valid for every image */
  bounds: CropRect
  /** Images whose alignment could not be determined (left at shift 0) */
  failedIds: string[]
}

export interface MultiCropMode {
  session: MultiCropSession | null
  /** Shared crop rect in reference image pixels */
  cropRect: CropRect | null
  lockAspectRatio: boolean
  aspectRatio: number
  ghostOpacity: Record<string, number>
  start: (ids: string[]) => void
  setCropRect: (rect: CropRect) => void
  setLockAspectRatio: (locked: boolean) => void
  setAspectRatio: (ar: number) => void
  setGhostOpacity: (id: string, opacity: number) => void
  apply: () => void
  cancel: () => void
}

const MIN_BOUNDS_SIZE = 10

const yieldToUi = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** Rounds a crop rect to whole pixels while keeping it inside bounds */
function roundWithin(rect: CropRect, bounds: CropRect): CropRect {
  const width = Math.max(1, Math.min(Math.round(rect.width), bounds.width))
  const height = Math.max(1, Math.min(Math.round(rect.height), bounds.height))
  const x = Math.max(bounds.x, Math.min(Math.round(rect.x), bounds.x + bounds.width - width))
  const y = Math.max(bounds.y, Math.min(Math.round(rect.y), bounds.y + bounds.height - height))
  return { x, y, width, height }
}

export function useMultiCropMode({
  items,
  sceneId,
  loadedImages,
  isOffline,
  onUpdateItem,
  onBatchTransform,
}: UseMultiCropModeParams): MultiCropMode {
  const [session, setSession] = useState<MultiCropSession | null>(null)
  const [cropRect, setCropRect] = useState<CropRect | null>(null)
  const [lockAspectRatio, setLockAspectRatio] = useState(false)
  const [aspectRatio, setAspectRatio] = useState(1)
  const [ghostOpacity, setGhostOpacityMap] = useState<Record<string, number>>({})
  // Incremented on every start/cancel so a stale alignment run can tell it was superseded
  const runTokenRef = useRef(0)

  const start = async (ids: string[]) => {
    const images = ids
      .map((id) => items.find((i) => i.id === id))
      .filter((i): i is ImageItem => i?.type === 'image')
    if (images.length < 2) return
    const sizes = images.map((img) => {
      const el = loadedImages.get(img.src)
      return el ? { width: el.naturalWidth, height: el.naturalHeight } : null
    })
    if (sizes.some((s) => !s)) return
    const knownSizes = sizes as { width: number; height: number }[]

    const token = ++runTokenRef.current
    const imageIds = images.map((i) => i.id)
    const ref = knownSizes[0]

    const finish = (shifts: Shift[], failedIds: string[]) => {
      let bounds = computeCompatibleBounds(knownSizes, shifts)
      if (bounds.width < MIN_BOUNDS_SIZE || bounds.height < MIN_BOUNDS_SIZE) {
        // Alignment produced no usable common region - fall back to top-left alignment
        shifts = shifts.map(() => ({ dx: 0, dy: 0 }))
        failedIds = imageIds.slice(1)
        bounds = computeCompatibleBounds(knownSizes, shifts)
      }
      setSession({ ids: imageIds, status: 'ready', progress: '', shifts, bounds, failedIds })
      setCropRect(bounds)
      setAspectRatio(bounds.width / bounds.height)
    }

    setLockAspectRatio(false)
    setGhostOpacityMap({})

    const zeroShifts = imageIds.map(() => ({ dx: 0, dy: 0 }))
    const sameSize = knownSizes.every((s) => s.width === ref.width && s.height === ref.height)
    if (sameSize) {
      finish(zeroShifts, [])
      return
    }

    setCropRect(null)
    setSession({
      ids: imageIds,
      status: 'aligning',
      progress: 'Loading images...',
      shifts: zeroShifts,
      bounds: { x: 0, y: 0, width: ref.width, height: ref.height },
      failedIds: [],
    })
    await yieldToUi()

    let refPixels: GrayImage | null = null
    try {
      refPixels = await loadGrayImage(sceneId, images[0])
    } catch (err) {
      console.error('MultiCrop: failed to load reference image pixels:', err)
    }

    const shifts: Shift[] = [{ dx: 0, dy: 0 }]
    const failedIds: string[] = []
    for (let i = 1; i < images.length; i++) {
      if (runTokenRef.current !== token) return
      setSession((s) => s && { ...s, progress: `Aligning image ${i + 1} of ${images.length}...` })
      await yieldToUi()

      let shift: Shift | null = null
      if (refPixels) {
        try {
          const target = await loadGrayImage(sceneId, images[i])
          shift = estimateShift(refPixels, target)
        } catch (err) {
          console.error('MultiCrop: failed to align image:', err)
        }
      }
      if (!shift) failedIds.push(images[i].id)
      shifts.push(shift ?? { dx: 0, dy: 0 })
    }

    if (runTokenRef.current !== token) return
    finish(shifts, failedIds)
  }

  const cancel = () => {
    runTokenRef.current++
    setSession(null)
    setCropRect(null)
    setLockAspectRatio(false)
    setGhostOpacityMap({})
  }

  const apply = () => {
    // Nothing to apply until alignment has finished
    if (session?.status === 'aligning') return
    if (!session || !cropRect) {
      cancel()
      return
    }

    const rect = roundWithin(cropRect, session.bounds)
    // With batch history available, record all crops as one undo step
    const skipHistory = !!onBatchTransform
    const entries: TransformEntry[] = []
    const serverCrops: { id: string; rect: CropRect }[] = []

    session.ids.forEach((id, i) => {
      const item = items.find((it) => it.id === id)
      if (!item || item.type !== 'image') return
      const el = loadedImages.get(item.src)
      if (!el) return

      const itemRect = { ...rect, x: rect.x + session.shifts[i].dx, y: rect.y + session.shifts[i].dy }
      const { changes, isFullImage } = computeCropChanges(item, el.naturalWidth, el.naturalHeight, itemRect)
      // Clear any previous server-side crop now; the new one arrives asynchronously
      onUpdateItem(id, { ...changes, cropSrc: undefined, cropSrcFileSize: undefined }, skipHistory)

      entries.push({
        objectId: id,
        oldTransform: {
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          cropRect: item.cropRect ?? null,
          cropSrc: item.cropSrc ?? null,
        },
        newTransform: {
          x: changes.x,
          y: changes.y,
          width: changes.width,
          height: changes.height,
          cropRect: isFullImage ? null : itemRect,
          cropSrc: null,
        },
      })
      if (!isFullImage) serverCrops.push({ id, rect: itemRect })
    })

    if (onBatchTransform && entries.length > 0) onBatchTransform(entries)
    cancel()

    if (isOffline) return
    for (const { id, rect: r } of serverCrops) {
      cropImage(sceneId, id, r)
        .then((result) => {
          // Add cache-busting timestamp to force browser to fetch fresh image
          const cacheBustedUrl = `${result.url}${result.url.includes('?') ? '&' : '?'}t=${Date.now()}`
          onUpdateItem(id, { cropSrc: cacheBustedUrl, cropSrcFileSize: result.fileSize }, true)
        })
        .catch((err) => {
          console.error('Failed to create server-side crop, LLM canvas crop still works:', err)
        })
    }
  }

  const setGhostOpacity = (id: string, opacity: number) => {
    setGhostOpacityMap((prev) => ({ ...prev, [id]: opacity }))
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
  }, [session, cropRect, items, loadedImages])

  return {
    session,
    cropRect,
    lockAspectRatio,
    aspectRatio,
    ghostOpacity,
    start,
    setCropRect,
    setLockAspectRatio,
    setAspectRatio,
    setGhostOpacity,
    apply,
    cancel,
  }
}
