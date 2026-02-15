import { snapToGrid } from './grid'

interface ViewportCenter {
  getViewportCenter: () => { x: number; y: number }
}

/**
 * Position at viewport center with random offset (±100px).
 * Used for toolbar-created items (text, prompt, image-gen, html-gen, coding robot).
 */
export function viewportCenterPosition(
  canvas: ViewportCenter | null,
  width: number,
  height: number,
): { x: number; y: number } {
  const center = canvas?.getViewportCenter()
  return {
    x: snapToGrid((center?.x ?? 100) - width / 2 + Math.random() * 200 - 100),
    y: snapToGrid((center?.y ?? 100) - height / 2 + Math.random() * 200 - 100),
  }
}

/**
 * Random position near top-left: 100 + rand(0,200).
 * Used for addImageItem, addVideoItem (no drop coordinates).
 */
export function randomFixedPosition(): { x: number; y: number } {
  return {
    x: snapToGrid(100 + Math.random() * 200),
    y: snapToGrid(100 + Math.random() * 200),
  }
}

/**
 * If explicit x/y are provided, snap and return them.
 * Otherwise fall back to viewportCenterPosition.
 * Used by toolbar items that can also be placed at a specific drop point.
 */
export function resolvePosition(
  canvas: ViewportCenter | null,
  width: number,
  height: number,
  x?: number,
  y?: number,
): { x: number; y: number } {
  if (x != null && y != null) {
    return { x: snapToGrid(x), y: snapToGrid(y) }
  }
  return viewportCenterPosition(canvas, width, height)
}

/**
 * Center horizontally on a point; y at top (or fully centered if topLeft=false).
 * - Default (topLeft undefined): x-centered, y at top  →  used by addImageAt, addVideoAt, addPdfAt, addTextFileAt
 * - topLeft=true: use x,y directly as top-left          →  used by addTextAt with topLeft flag
 * - topLeft=false: center both axes                      →  used by addTextAt without topLeft flag
 */
export function centeredAtPoint(
  x: number,
  y: number,
  width: number,
  height?: number,
  topLeft?: boolean,
): { x: number; y: number } {
  if (topLeft === true) {
    return { x: snapToGrid(x), y: snapToGrid(y) }
  }
  if (topLeft === false) {
    // Fully centered on the point (both axes)
    return {
      x: snapToGrid(x - width / 2),
      y: snapToGrid(y - (height ?? 0) / 2),
    }
  }
  // Default: x-centered, y at top
  return {
    x: snapToGrid(x - width / 2),
    y: snapToGrid(y),
  }
}
