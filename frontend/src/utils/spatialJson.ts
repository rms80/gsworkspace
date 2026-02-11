import { CanvasItem, TextItem, ImageItem } from '../types'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface SpatialTextBlock {
  type: 'text'
  content: string
  bounds: Bounds
}

export interface SpatialImageBlock {
  type: 'image'
  imageId: string  // Placeholder ID to keep prompt small
  bounds: Bounds
}

export type SpatialBlock = SpatialTextBlock | SpatialImageBlock

// Map of image placeholder IDs to actual source URLs
export type ImageSourceMap = Map<string, string>

export interface SpatialData {
  page: { bounds: Bounds }
  items: SpatialBlock[]
}

export interface SpatialConversionResult {
  spatialData: SpatialData
  imageMap: ImageSourceMap
}

/**
 * Get the visual bounding box of an item, accounting for image scale.
 */
function getItemBounds(item: TextItem | ImageItem): Bounds {
  const w = item.type === 'image' ? item.width * (item.scaleX ?? 1) : item.width
  const h = item.type === 'image' ? item.height * (item.scaleY ?? 1) : item.height
  return { x: item.x, y: item.y, width: w, height: h }
}

/**
 * Converts canvas items to a spatial JSON format for HTML generation.
 * Computes a total bounding box shifted to origin (0,0).
 * Each item's bounds are relative to that origin.
 * Images are assigned placeholder IDs to keep the prompt small.
 */
export function convertItemsToSpatialJson(items: CanvasItem[]): SpatialConversionResult {
  // Filter to only text and image items
  const filteredItems = items.filter(
    (item): item is TextItem | ImageItem => item.type === 'text' || item.type === 'image'
  )

  if (filteredItems.length === 0) {
    return {
      spatialData: {
        page: { bounds: { x: 0, y: 0, width: 0, height: 0 } },
        items: [],
      },
      imageMap: new Map(),
    }
  }

  // Compute total bounding box from all items
  const allBounds = filteredItems.map(getItemBounds)
  const minX = Math.min(...allBounds.map(b => b.x))
  const minY = Math.min(...allBounds.map(b => b.y))
  const maxX = Math.max(...allBounds.map(b => b.x + b.width))
  const maxY = Math.max(...allBounds.map(b => b.y + b.height))

  const pageBounds: Bounds = {
    x: 0,
    y: 0,
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
  }

  // Sort by Y position (top to bottom)
  const sortedItems = [...filteredItems].sort((a, b) => a.y - b.y)

  const imageMap: ImageSourceMap = new Map()
  let imageCounter = 1

  // Convert to spatial blocks with coordinates shifted to origin
  const blocks = sortedItems.map((item): SpatialBlock => {
    const ib = getItemBounds(item)
    const bounds: Bounds = {
      x: Math.round(ib.x - minX),
      y: Math.round(ib.y - minY),
      width: Math.round(ib.width),
      height: Math.round(ib.height),
    }

    if (item.type === 'text') {
      return {
        type: 'text',
        content: item.text,
        bounds,
      }
    } else {
      const imageId = `IMAGE_${imageCounter++}`
      imageMap.set(imageId, item.cropSrc ?? item.src)
      return {
        type: 'image',
        imageId,
        bounds,
      }
    }
  })

  return {
    spatialData: {
      page: { bounds: pageBounds },
      items: blocks,
    },
    imageMap,
  }
}

/**
 * Replaces image placeholder IDs in HTML with actual source URLs.
 */
export function replaceImagePlaceholders(html: string, imageMap: ImageSourceMap): string {
  let result = html
  imageMap.forEach((src, imageId) => {
    // Replace all occurrences of the placeholder ID with the actual src
    result = result.split(imageId).join(src)
  })
  return result
}
