import { CanvasItem, TextItem, ImageItem } from '../types'

export interface SpatialTextBlock {
  type: 'text'
  content: string
  position: { x: number; y: number }
  size: { width: number; height: number }
}

export interface SpatialImageBlock {
  type: 'image'
  imageId: string  // Placeholder ID to keep prompt small
  position: { x: number; y: number }
  size: { width: number; height: number; scaleX?: number; scaleY?: number }
}

export type SpatialBlock = SpatialTextBlock | SpatialImageBlock

// Map of image placeholder IDs to actual source URLs
export type ImageSourceMap = Map<string, string>

export interface SpatialConversionResult {
  blocks: SpatialBlock[]
  imageMap: ImageSourceMap
}

/**
 * Converts canvas items to a spatial JSON format for HTML generation.
 * Filters to TextItem and ImageItem only, sorts by Y position (top to bottom).
 * Images are assigned placeholder IDs to keep the prompt small.
 */
export function convertItemsToSpatialJson(items: CanvasItem[]): SpatialConversionResult {
  // Filter to only text and image items
  const filteredItems = items.filter(
    (item): item is TextItem | ImageItem => item.type === 'text' || item.type === 'image'
  )

  // Sort by Y position (top to bottom)
  const sortedItems = [...filteredItems].sort((a, b) => a.y - b.y)

  const imageMap: ImageSourceMap = new Map()
  let imageCounter = 1

  // Convert to spatial blocks
  const blocks = sortedItems.map((item): SpatialBlock => {
    if (item.type === 'text') {
      return {
        type: 'text',
        content: item.text,
        position: { x: item.x, y: item.y },
        size: { width: item.width, height: item.height },
      }
    } else {
      const imageId = `IMAGE_${imageCounter++}`
      imageMap.set(imageId, item.cropSrc ?? item.src)
      return {
        type: 'image',
        imageId,
        position: { x: item.x, y: item.y },
        size: {
          width: item.width,
          height: item.height,
          scaleX: item.scaleX,
          scaleY: item.scaleY,
        },
      }
    }
  })

  return { blocks, imageMap }
}

/**
 * Replaces image placeholder IDs in HTML with actual source URLs.
 */
export function replaceImagePlaceholders(html: string, imageMap: ImageSourceMap): string {
  let result = html
  imageMap.forEach((src, imageId) => {
    // Replace all occurrences of the placeholder ID with the actual src
    result = result.replace(new RegExp(imageId, 'g'), src)
  })
  return result
}
