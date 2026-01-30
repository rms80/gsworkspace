import { useState, useEffect } from 'react'
import { CanvasItem } from '../types'
import { resolveAssetUrl } from '../utils/assetUrl'

export interface ImageLoader {
  loadedImages: Map<string, HTMLImageElement>
}

export function useImageLoader(items: CanvasItem[], assetBaseUrl?: string): ImageLoader {
  const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    items.forEach((item) => {
      if (item.type === 'image' && !loadedImages.has(item.src)) {
        const img = new window.Image()
        // Resolve relative paths to full URLs for loading
        img.src = resolveAssetUrl(assetBaseUrl, item.src)
        img.onload = () => {
          // Store by the original src (relative path) so lookups work
          setLoadedImages((prev) => new Map(prev).set(item.src, img))
        }
      }
    })
  }, [items, loadedImages, assetBaseUrl])

  return { loadedImages }
}
