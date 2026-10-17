import { CanvasItem } from '../types'

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

/** Approximate on-canvas bounds of an item (including image/video scale) */
export function itemBounds(item: CanvasItem): Bounds {
  const scaleX = 'scaleX' in item ? item.scaleX ?? 1 : 1
  const scaleY = 'scaleY' in item ? item.scaleY ?? 1 : 1
  return { x: item.x, y: item.y, width: item.width * scaleX, height: item.height * scaleY }
}

/**
 * Sorts items into reading order: rows top to bottom, items within a row left to right.
 * Items whose vertical extents overlap by at least half the smaller height share a row, so a
 * visually horizontal row stays left-to-right even if the items' tops differ slightly.
 */
export function sortByReadingOrder<T extends CanvasItem>(items: T[]): T[] {
  const entries = items.map((item) => ({ item, b: itemBounds(item) }))
  entries.sort((a, b) => a.b.y - b.b.y || a.b.x - b.b.x)

  const rows: { top: number; bottom: number; entries: typeof entries }[] = []
  for (const entry of entries) {
    const top = entry.b.y
    const bottom = entry.b.y + entry.b.height
    const row = rows[rows.length - 1]
    if (row) {
      const overlap = Math.min(bottom, row.bottom) - Math.max(top, row.top)
      const minHeight = Math.min(entry.b.height, row.bottom - row.top)
      if (overlap > 0 && overlap >= minHeight / 2) {
        row.entries.push(entry)
        row.bottom = Math.max(row.bottom, bottom)
        continue
      }
    }
    rows.push({ top, bottom, entries: [entry] })
  }

  return rows.flatMap((row) => row.entries.sort((a, b) => a.b.x - b.b.x).map((e) => e.item))
}
