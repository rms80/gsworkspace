import { useState, useEffect } from 'react'
import { CanvasItem } from '../types'

export interface ImageLoader {
  loadedImages: Map<string, HTMLImageElement>
}

export function useImageLoader(items: CanvasItem[]): ImageLoader {
  const [loadedImages, setLoadedImages] = useState<Map<string, HTMLImageElement>>(new Map())

  useEffect(() => {
    items.forEach((item) => {
      if (item.type === 'image' && !loadedImages.has(item.src)) {
        const img = new window.Image()
        img.src = item.src
        img.onload = () => {
          setLoadedImages((prev) => new Map(prev).set(item.src, img))
        }
      }
    })
  }, [items, loadedImages])

  return { loadedImages }
}
