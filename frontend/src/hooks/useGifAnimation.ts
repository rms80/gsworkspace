import { useMemo } from 'react'
import { CanvasItem, ImageItem } from '../types'
import { isGifSrc } from '../utils/gif'

/**
 * Returns the set of image item IDs that are animated GIFs.
 * These items should use a DOM <img> overlay instead of Konva Image
 * so the browser handles GIF animation natively.
 */
export function useGifAnimation(
  items: CanvasItem[],
): Set<string> {
  return useMemo(
    () => new Set(
      items
        .filter((item): item is ImageItem => item.type === 'image' && isGifSrc(item.src))
        .map((item) => item.id),
    ),
    [items],
  )
}
