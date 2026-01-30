import { useRef, useEffect, useCallback } from 'react'
import { Group, Image as KonvaImage, Rect, Line } from 'react-konva'
import Konva from 'konva'
import { CropRect, ImageItem } from '../types'

interface ImageCropOverlayProps {
  item: ImageItem
  image: HTMLImageElement
  cropRect: CropRect
  stageScale: number
  onCropChange: (crop: CropRect) => void
}

const MIN_CROP_SIZE = 10
const HANDLE_SIZE = 8
const OVERLAY_OPACITY = 0.5

type HandlePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right'

function clampCrop(crop: CropRect, natW: number, natH: number): CropRect {
  let { x, y, width, height } = crop
  width = Math.max(MIN_CROP_SIZE, width)
  height = Math.max(MIN_CROP_SIZE, height)
  x = Math.max(0, Math.min(x, natW - MIN_CROP_SIZE))
  y = Math.max(0, Math.min(y, natH - MIN_CROP_SIZE))
  width = Math.min(width, natW - x)
  height = Math.min(height, natH - y)
  return { x, y, width, height }
}

interface DragState {
  type: 'handle' | 'body'
  handlePos?: HandlePosition
  startMouseX: number
  startMouseY: number
  startCrop: CropRect
}

export default function ImageCropOverlay({ item, image, cropRect, stageScale, onCropChange }: ImageCropOverlayProps) {
  const dragStateRef = useRef<DragState | null>(null)

  const natW = image.naturalWidth
  const natH = image.naturalHeight

  // Get scale factors (default to 1)
  const scaleX = item.scaleX ?? 1
  const scaleY = item.scaleY ?? 1

  // Display scale: how big is one source pixel on screen (including scaleX/scaleY)
  const currentSourceW = item.cropRect?.width ?? natW
  const currentSourceH = item.cropRect?.height ?? natH
  const baseDisplayScaleX = item.width / currentSourceW
  const baseDisplayScaleY = item.height / currentSourceH
  const displayScaleX = baseDisplayScaleX * scaleX
  const displayScaleY = baseDisplayScaleY * scaleY

  // Full image display dimensions (scaled)
  const fullDisplayW = natW * displayScaleX
  const fullDisplayH = natH * displayScaleY

  // Crop rect in display coordinates
  const cx = cropRect.x * displayScaleX
  const cy = cropRect.y * displayScaleY
  const cw = cropRect.width * displayScaleX
  const ch = cropRect.height * displayScaleY

  // Handle visual size adjusted for stage zoom
  const hs = HANDLE_SIZE / stageScale

  const handlePositions: { pos: HandlePosition; x: number; y: number }[] = [
    { pos: 'top-left', x: cx, y: cy },
    { pos: 'top-right', x: cx + cw, y: cy },
    { pos: 'bottom-left', x: cx, y: cy + ch },
    { pos: 'bottom-right', x: cx + cw, y: cy + ch },
    { pos: 'top', x: cx + cw / 2, y: cy },
    { pos: 'bottom', x: cx + cw / 2, y: cy + ch },
    { pos: 'left', x: cx, y: cy + ch / 2 },
    { pos: 'right', x: cx + cw, y: cy + ch / 2 },
  ]

  // Offset for the group: position the full image so that the current crop region
  // is aligned to where the item originally sits
  const offsetX = item.x - (item.cropRect?.x ?? 0) * displayScaleX
  const offsetY = item.y - (item.cropRect?.y ?? 0) * displayScaleY

  // Use a ref to always have the latest cropRect in the mousemove handler
  const cropRectRef = useRef(cropRect)
  cropRectRef.current = cropRect

  const displayScaleXRef = useRef(displayScaleX)
  displayScaleXRef.current = displayScaleX
  const displayScaleYRef = useRef(displayScaleY)
  displayScaleYRef.current = displayScaleY

  const onCropChangeRef = useRef(onCropChange)
  onCropChangeRef.current = onCropChange

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const ds = dragStateRef.current
    if (!ds) return
    e.preventDefault()

    const dx = (e.clientX - ds.startMouseX) / stageScale / displayScaleXRef.current
    const dy = (e.clientY - ds.startMouseY) / stageScale / displayScaleYRef.current

    if (ds.type === 'body') {
      let nx = ds.startCrop.x + dx
      let ny = ds.startCrop.y + dy
      nx = Math.max(0, Math.min(nx, natW - ds.startCrop.width))
      ny = Math.max(0, Math.min(ny, natH - ds.startCrop.height))
      onCropChangeRef.current({ ...ds.startCrop, x: nx, y: ny })
    } else if (ds.type === 'handle' && ds.handlePos) {
      let { x: bx, y: by, width: bw, height: bh } = ds.startCrop
      switch (ds.handlePos) {
        case 'top-left':
          bx += dx; by += dy; bw -= dx; bh -= dy; break
        case 'top-right':
          by += dy; bw += dx; bh -= dy; break
        case 'bottom-left':
          bx += dx; bw -= dx; bh += dy; break
        case 'bottom-right':
          bw += dx; bh += dy; break
        case 'top':
          by += dy; bh -= dy; break
        case 'bottom':
          bh += dy; break
        case 'left':
          bx += dx; bw -= dx; break
        case 'right':
          bw += dx; break
      }
      onCropChangeRef.current(clampCrop({ x: bx, y: by, width: bw, height: bh }, natW, natH))
    }
  }, [natW, natH, stageScale])

  const handleMouseUp = useCallback(() => {
    dragStateRef.current = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const startDrag = (e: Konva.KonvaEventObject<MouseEvent>, type: 'body' | 'handle', handlePos?: HandlePosition) => {
    e.cancelBubble = true
    dragStateRef.current = {
      type,
      handlePos,
      startMouseX: e.evt.clientX,
      startMouseY: e.evt.clientY,
      startCrop: { ...cropRect },
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <Group
      x={offsetX}
      y={offsetY}
    >
      {/* Full image at low opacity */}
      <KonvaImage
        image={image}
        width={fullDisplayW}
        height={fullDisplayH}
        opacity={0.3}
      />

      {/* Cropped region at full opacity via clip */}
      <Group
        clipX={cx}
        clipY={cy}
        clipWidth={cw}
        clipHeight={ch}
      >
        <KonvaImage
          image={image}
          width={fullDisplayW}
          height={fullDisplayH}
          opacity={1}
        />
      </Group>

      {/* Dim overlay rects around crop area */}
      {/* Top */}
      <Rect x={0} y={0} width={fullDisplayW} height={cy} fill="black" opacity={OVERLAY_OPACITY} listening={false} />
      {/* Bottom */}
      <Rect x={0} y={cy + ch} width={fullDisplayW} height={fullDisplayH - cy - ch} fill="black" opacity={OVERLAY_OPACITY} listening={false} />
      {/* Left */}
      <Rect x={0} y={cy} width={cx} height={ch} fill="black" opacity={OVERLAY_OPACITY} listening={false} />
      {/* Right */}
      <Rect x={cx + cw} y={cy} width={fullDisplayW - cx - cw} height={ch} fill="black" opacity={OVERLAY_OPACITY} listening={false} />

      {/* Dashed crop border */}
      <Line
        points={[cx, cy, cx + cw, cy, cx + cw, cy + ch, cx, cy + ch, cx, cy]}
        stroke="white"
        strokeWidth={1 / stageScale}
        dash={[6 / stageScale, 4 / stageScale]}
        listening={false}
      />

      {/* Draggable body (crop region center) */}
      <Rect
        x={cx}
        y={cy}
        width={cw}
        height={ch}
        fill="transparent"
        onMouseDown={(e) => startDrag(e, 'body')}
      />

      {/* Handles */}
      {handlePositions.map(({ pos, x, y }) => (
        <Rect
          key={pos}
          x={x - hs / 2}
          y={y - hs / 2}
          width={hs}
          height={hs}
          fill="white"
          stroke="#333"
          strokeWidth={1 / stageScale}
          onMouseDown={(e) => startDrag(e, 'handle', pos)}
          onMouseEnter={(e: Konva.KonvaEventObject<MouseEvent>) => {
            const cursor: Record<HandlePosition, string> = {
              'top-left': 'nwse-resize',
              'top-right': 'nesw-resize',
              'bottom-left': 'nesw-resize',
              'bottom-right': 'nwse-resize',
              'top': 'ns-resize',
              'bottom': 'ns-resize',
              'left': 'ew-resize',
              'right': 'ew-resize',
            }
            const stage = e.target.getStage()
            if (stage) {
              stage.container().style.cursor = cursor[pos]
            }
          }}
          onMouseLeave={(e: Konva.KonvaEventObject<MouseEvent>) => {
            const stage = e.target.getStage()
            if (stage) {
              stage.container().style.cursor = 'default'
            }
          }}
        />
      ))}
    </Group>
  )
}
