import { useRef, useEffect, useCallback } from 'react'
import { CropRect, VideoItem } from '../../../types'

interface VideoCropOverlayProps {
  item: VideoItem
  cropRect: CropRect
  stageScale: number
  stagePos: { x: number; y: number }
  onCropChange: (crop: CropRect) => void
}

const MIN_CROP_SIZE = 10
const HANDLE_SIZE = 10

type HandlePosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right'

function clampCrop(crop: CropRect, maxW: number, maxH: number): CropRect {
  let { x, y, width, height } = crop
  width = Math.max(MIN_CROP_SIZE, width)
  height = Math.max(MIN_CROP_SIZE, height)
  x = Math.max(0, Math.min(x, maxW - MIN_CROP_SIZE))
  y = Math.max(0, Math.min(y, maxH - MIN_CROP_SIZE))
  width = Math.min(width, maxW - x)
  height = Math.min(height, maxH - y)
  return { x, y, width, height }
}

interface DragState {
  type: 'handle' | 'body'
  handlePos?: HandlePosition
  startMouseX: number
  startMouseY: number
  startCrop: CropRect
}

/**
 * HTML-based video crop overlay.
 * Shows the video at low opacity with the crop region at full opacity.
 */
export default function VideoCropOverlay({
  item,
  cropRect,
  stageScale,
  stagePos,
  onCropChange,
}: VideoCropOverlayProps) {
  const dragStateRef = useRef<DragState | null>(null)

  // Original video dimensions
  const origW = item.originalWidth ?? item.width
  const origH = item.originalHeight ?? item.height
  const scaleX = item.scaleX ?? 1
  const scaleY = item.scaleY ?? 1

  // Display scale: how big is one source pixel on screen
  const currentSourceW = item.cropRect?.width ?? origW
  const currentSourceH = item.cropRect?.height ?? origH
  const baseDisplayScaleX = item.width / currentSourceW
  const baseDisplayScaleY = item.height / currentSourceH
  const displayScaleX = baseDisplayScaleX * scaleX
  const displayScaleY = baseDisplayScaleY * scaleY

  // Full video display dimensions
  const fullDisplayW = origW * displayScaleX
  const fullDisplayH = origH * displayScaleY

  // Offset: position so that current crop region aligns with item position
  const offsetX = item.x - (item.cropRect?.x ?? 0) * displayScaleX
  const offsetY = item.y - (item.cropRect?.y ?? 0) * displayScaleY

  // Crop rect in display coordinates
  const cx = cropRect.x * displayScaleX
  const cy = cropRect.y * displayScaleY
  const cw = cropRect.width * displayScaleX
  const ch = cropRect.height * displayScaleY

  // Convert to screen coordinates
  const screenLeft = offsetX * stageScale + stagePos.x
  const screenTop = offsetY * stageScale + stagePos.y
  const screenFullW = fullDisplayW * stageScale
  const screenFullH = fullDisplayH * stageScale
  const screenCx = cx * stageScale
  const screenCy = cy * stageScale
  const screenCw = cw * stageScale
  const screenCh = ch * stageScale

  // Keep refs for callbacks
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
      nx = Math.max(0, Math.min(nx, origW - ds.startCrop.width))
      ny = Math.max(0, Math.min(ny, origH - ds.startCrop.height))
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
      onCropChangeRef.current(clampCrop({ x: bx, y: by, width: bw, height: bh }, origW, origH))
    }
  }, [origW, origH, stageScale])

  const handleMouseUp = useCallback(() => {
    dragStateRef.current = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  const startDrag = (e: React.MouseEvent, type: 'body' | 'handle', handlePos?: HandlePosition) => {
    e.stopPropagation()
    dragStateRef.current = {
      type,
      handlePos,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startCrop: { ...cropRect },
    }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handlePositions: { pos: HandlePosition; left: number; top: number; cursor: string }[] = [
    { pos: 'top-left', left: screenCx, top: screenCy, cursor: 'nwse-resize' },
    { pos: 'top-right', left: screenCx + screenCw, top: screenCy, cursor: 'nesw-resize' },
    { pos: 'bottom-left', left: screenCx, top: screenCy + screenCh, cursor: 'nesw-resize' },
    { pos: 'bottom-right', left: screenCx + screenCw, top: screenCy + screenCh, cursor: 'nwse-resize' },
    { pos: 'top', left: screenCx + screenCw / 2, top: screenCy, cursor: 'ns-resize' },
    { pos: 'bottom', left: screenCx + screenCw / 2, top: screenCy + screenCh, cursor: 'ns-resize' },
    { pos: 'left', left: screenCx, top: screenCy + screenCh / 2, cursor: 'ew-resize' },
    { pos: 'right', left: screenCx + screenCw, top: screenCy + screenCh / 2, cursor: 'ew-resize' },
  ]

  return (
    <div
      style={{
        position: 'absolute',
        left: screenLeft,
        top: screenTop,
        width: screenFullW,
        height: screenFullH,
        pointerEvents: 'auto',
        zIndex: 1000,
      }}
    >
      {/* Video at low opacity */}
      <video
        src={item.src}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'fill',
          opacity: 0.3,
          pointerEvents: 'none',
        }}
        muted
        playsInline
      />

      {/* Dark overlay for areas outside crop */}
      {/* Top */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: screenFullW,
          height: screenCy,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />
      {/* Bottom */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: screenCy + screenCh,
          width: screenFullW,
          height: screenFullH - screenCy - screenCh,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />
      {/* Left */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: screenCy,
          width: screenCx,
          height: screenCh,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />
      {/* Right */}
      <div
        style={{
          position: 'absolute',
          left: screenCx + screenCw,
          top: screenCy,
          width: screenFullW - screenCx - screenCw,
          height: screenCh,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />

      {/* Video at full opacity inside crop region (clipped) */}
      <div
        style={{
          position: 'absolute',
          left: screenCx,
          top: screenCy,
          width: screenCw,
          height: screenCh,
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <video
          src={item.src}
          style={{
            position: 'absolute',
            left: -screenCx,
            top: -screenCy,
            width: screenFullW,
            height: screenFullH,
            objectFit: 'fill',
            pointerEvents: 'none',
          }}
          muted
          playsInline
        />
      </div>

      {/* Dashed crop border */}
      <div
        style={{
          position: 'absolute',
          left: screenCx,
          top: screenCy,
          width: screenCw,
          height: screenCh,
          border: '2px dashed white',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        }}
      />

      {/* Draggable body (crop region) */}
      <div
        style={{
          position: 'absolute',
          left: screenCx,
          top: screenCy,
          width: screenCw,
          height: screenCh,
          cursor: 'move',
        }}
        onMouseDown={(e) => startDrag(e, 'body')}
      />

      {/* Handles */}
      {handlePositions.map(({ pos, left, top, cursor }) => (
        <div
          key={pos}
          style={{
            position: 'absolute',
            left: left - HANDLE_SIZE / 2,
            top: top - HANDLE_SIZE / 2,
            width: HANDLE_SIZE,
            height: HANDLE_SIZE,
            backgroundColor: 'white',
            border: '1px solid #333',
            cursor,
          }}
          onMouseDown={(e) => startDrag(e, 'handle', pos)}
        />
      ))}

      {/* Instructions */}
      <div
        style={{
          position: 'absolute',
          bottom: -30,
          left: 0,
          right: 0,
          textAlign: 'center',
          color: 'white',
          fontSize: 12,
          fontFamily: 'system-ui, sans-serif',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
        }}
      >
        Press Enter to apply, Escape to cancel
      </div>
    </div>
  )
}
