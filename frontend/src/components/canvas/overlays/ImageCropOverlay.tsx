import { useState, useRef, useEffect, useCallback } from 'react'
import { CropRect, ImageItem } from '../../../types'

interface ImageCropOverlayProps {
  item: ImageItem
  image: HTMLImageElement
  cropRect: CropRect
  stageScale: number
  stagePos: { x: number; y: number }
  lockAspectRatio: boolean
  onCropChange: (crop: CropRect) => void
  onLockAspectRatioChange: (locked: boolean) => void
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
 * HTML-based image crop overlay.
 * Shows the image at low opacity with the crop region at full opacity.
 * Includes a control panel with X, Y, Width, Height fields and aspect ratio lock.
 */
const ASPECT_RATIO_PRESETS = [
  { label: '1:1', value: 1 },
  { label: '3:2', value: 3 / 2 },
  { label: '4:3', value: 4 / 3 },
  { label: '16:9', value: 16 / 9 },
]

export default function ImageCropOverlay({
  item,
  image,
  cropRect,
  stageScale,
  stagePos,
  lockAspectRatio,
  onCropChange,
  onLockAspectRatioChange,
}: ImageCropOverlayProps) {
  const dragStateRef = useRef<DragState | null>(null)
  const aspectRatioRef = useRef(cropRect.width / cropRect.height)
  const [showAspectMenu, setShowAspectMenu] = useState(false)
  const aspectMenuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!showAspectMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      if (aspectMenuRef.current && !aspectMenuRef.current.contains(e.target as Node)) {
        setShowAspectMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showAspectMenu])

  // Local state for input fields - only commit on blur/Enter
  const [inputValues, setInputValues] = useState({
    x: String(Math.round(cropRect.x)),
    y: String(Math.round(cropRect.y)),
    width: String(Math.round(cropRect.width)),
    height: String(Math.round(cropRect.height)),
  })

  // Sync input values when cropRect changes from dragging
  useEffect(() => {
    setInputValues({
      x: String(Math.round(cropRect.x)),
      y: String(Math.round(cropRect.y)),
      width: String(Math.round(cropRect.width)),
      height: String(Math.round(cropRect.height)),
    })
  }, [cropRect.x, cropRect.y, cropRect.width, cropRect.height])

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

  // Full image display dimensions
  const fullDisplayW = natW * displayScaleX
  const fullDisplayH = natH * displayScaleY

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
  const lockAspectRatioRef = useRef(lockAspectRatio)
  lockAspectRatioRef.current = lockAspectRatio

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
      const ar = aspectRatioRef.current
      const locked = lockAspectRatioRef.current

      switch (ds.handlePos) {
        case 'top-left':
          bw -= dx; bh -= dy
          if (locked) {
            const newW = ds.startCrop.width - dx
            const newH = ds.startCrop.height - dy
            if (Math.abs(dx) > Math.abs(dy)) {
              bh = newW / ar
            } else {
              bw = newH * ar
            }
          }
          bx = ds.startCrop.x + ds.startCrop.width - bw
          by = ds.startCrop.y + ds.startCrop.height - bh
          break
        case 'top-right':
          bw += dx; bh -= dy
          if (locked) {
            const newW = ds.startCrop.width + dx
            const newH = ds.startCrop.height - dy
            if (Math.abs(dx) > Math.abs(dy)) {
              bh = newW / ar
            } else {
              bw = newH * ar
            }
          }
          by = ds.startCrop.y + ds.startCrop.height - bh
          break
        case 'bottom-left':
          bw -= dx; bh += dy
          if (locked) {
            const newW = ds.startCrop.width - dx
            const newH = ds.startCrop.height + dy
            if (Math.abs(dx) > Math.abs(dy)) {
              bh = newW / ar
            } else {
              bw = newH * ar
            }
          }
          bx = ds.startCrop.x + ds.startCrop.width - bw
          break
        case 'bottom-right':
          bw += dx; bh += dy
          if (locked) {
            const newW = ds.startCrop.width + dx
            const newH = ds.startCrop.height + dy
            if (Math.abs(dx) > Math.abs(dy)) {
              bh = newW / ar
            } else {
              bw = newH * ar
            }
          }
          break
        case 'top':
          bh -= dy
          if (locked) bw = bh * ar
          by = ds.startCrop.y + ds.startCrop.height - bh
          if (locked) bx = ds.startCrop.x + (ds.startCrop.width - bw) / 2
          break
        case 'bottom':
          bh += dy
          if (locked) bw = bh * ar
          if (locked) bx = ds.startCrop.x + (ds.startCrop.width - bw) / 2
          break
        case 'left':
          bw -= dx
          if (locked) bh = bw / ar
          bx = ds.startCrop.x + ds.startCrop.width - bw
          if (locked) by = ds.startCrop.y + (ds.startCrop.height - bh) / 2
          break
        case 'right':
          bw += dx
          if (locked) bh = bw / ar
          if (locked) by = ds.startCrop.y + (ds.startCrop.height - bh) / 2
          break
      }
      onCropChangeRef.current(clampCrop({ x: bx, y: by, width: bw, height: bh }, natW, natH))
    }
  }, [natW, natH, stageScale])

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

  // Input change handler - only update local state
  const handleInputChange = (field: 'x' | 'y' | 'width' | 'height', value: string) => {
    setInputValues((prev) => ({ ...prev, [field]: value }))
  }

  // Commit input value to crop rect
  const commitInput = (field: 'x' | 'y' | 'width' | 'height') => {
    const num = parseInt(inputValues[field], 10)
    if (isNaN(num)) {
      // Reset to current crop value if invalid
      setInputValues((prev) => ({
        ...prev,
        [field]: String(Math.round(cropRect[field])),
      }))
      return
    }

    let newCrop = { ...cropRect }

    if (field === 'width') {
      newCrop.width = num
      if (lockAspectRatio) {
        newCrop.height = Math.round(num / aspectRatioRef.current)
      }
    } else if (field === 'height') {
      newCrop.height = num
      if (lockAspectRatio) {
        newCrop.width = Math.round(num * aspectRatioRef.current)
      }
    } else {
      newCrop[field] = num
    }

    onCropChange(clampCrop(newCrop, natW, natH))
  }

  // Handle Enter key in input fields
  const handleInputKeyDown = (e: React.KeyboardEvent, field: 'x' | 'y' | 'width' | 'height') => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      commitInput(field)
      ;(e.target as HTMLInputElement).blur()
    }
  }

  const handleLockToggle = () => {
    if (!lockAspectRatio) {
      // When locking, capture current aspect ratio
      aspectRatioRef.current = cropRect.width / cropRect.height
    }
    onLockAspectRatioChange(!lockAspectRatio)
  }

  const applyAspectRatioPreset = (ar: number) => {
    // Calculate new dimensions that fit within the current crop center
    // Keep the crop centered and adjust width/height to match the new aspect ratio
    const centerX = cropRect.x + cropRect.width / 2
    const centerY = cropRect.y + cropRect.height / 2

    let newWidth: number
    let newHeight: number

    // Determine whether to fit by width or height
    const currentAr = cropRect.width / cropRect.height
    if (ar > currentAr) {
      // New ratio is wider - keep width, reduce height
      newWidth = cropRect.width
      newHeight = newWidth / ar
    } else {
      // New ratio is taller - keep height, reduce width
      newHeight = cropRect.height
      newWidth = newHeight * ar
    }

    // Calculate new position to keep centered
    let newX = centerX - newWidth / 2
    let newY = centerY - newHeight / 2

    // Clamp to image bounds
    newX = Math.max(0, Math.min(newX, natW - newWidth))
    newY = Math.max(0, Math.min(newY, natH - newHeight))

    // If dimensions exceed bounds, scale down
    if (newWidth > natW) {
      newWidth = natW
      newHeight = newWidth / ar
      newX = 0
      newY = Math.max(0, Math.min(centerY - newHeight / 2, natH - newHeight))
    }
    if (newHeight > natH) {
      newHeight = natH
      newWidth = newHeight * ar
      newY = 0
      newX = Math.max(0, Math.min(centerX - newWidth / 2, natW - newWidth))
    }

    // Update the aspect ratio ref and enable lock
    aspectRatioRef.current = ar
    onCropChange(clampCrop({ x: newX, y: newY, width: newWidth, height: newHeight }, natW, natH))
    if (!lockAspectRatio) {
      onLockAspectRatioChange(true)
    }
    setShowAspectMenu(false)
  }

  const inputStyle: React.CSSProperties = {
    width: 38,
    backgroundColor: 'white',
    color: '#333',
    border: '1px solid #555',
    borderRadius: 3,
    padding: '2px 4px',
    fontSize: 12,
    textAlign: 'right',
  }

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
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Image at low opacity */}
      <img
        src={item.src}
        alt=""
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'fill',
          opacity: 0.3,
          pointerEvents: 'none',
        }}
      />

      {/* Dark overlay for areas outside crop */}
      {/* Top */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: screenFullW,
          height: Math.max(0, screenCy),
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />
      {/* Bottom */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: Math.max(0, screenCy + screenCh),
          width: screenFullW,
          height: Math.max(0, screenFullH - screenCy - screenCh),
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />
      {/* Left */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: Math.max(0, screenCy),
          width: Math.max(0, screenCx),
          height: Math.max(0, screenCh),
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />
      {/* Right */}
      <div
        style={{
          position: 'absolute',
          left: Math.max(0, screenCx + screenCw),
          top: Math.max(0, screenCy),
          width: Math.max(0, screenFullW - screenCx - screenCw),
          height: Math.max(0, screenCh),
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          pointerEvents: 'none',
        }}
      />

      {/* Image at full opacity inside crop region (clipped) */}
      <div
        style={{
          position: 'absolute',
          left: Math.max(0, screenCx),
          top: Math.max(0, screenCy),
          width: Math.max(0, screenCw),
          height: Math.max(0, screenCh),
          overflow: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <img
          src={item.src}
          alt=""
          style={{
            position: 'absolute',
            left: -Math.max(0, screenCx),
            top: -Math.max(0, screenCy),
            width: screenFullW,
            height: screenFullH,
            objectFit: 'fill',
            pointerEvents: 'none',
          }}
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

      {/* Control Panel */}
      <div
        style={{
          position: 'absolute',
          bottom: -60,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          borderRadius: 6,
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          color: 'white',
          whiteSpace: 'nowrap',
        }}
      >
        <style>{`
          .crop-input::-webkit-outer-spin-button,
          .crop-input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          .crop-input[type=number] {
            -moz-appearance: textfield;
          }
        `}</style>
        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>X:</span>
            <input
              type="number"
              className="crop-input"
              value={inputValues.x}
              onChange={(e) => handleInputChange('x', e.target.value)}
              onBlur={() => commitInput('x')}
              onKeyDown={(e) => handleInputKeyDown(e, 'x')}
              onFocus={(e) => e.target.select()}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Y:</span>
            <input
              type="number"
              className="crop-input"
              value={inputValues.y}
              onChange={(e) => handleInputChange('y', e.target.value)}
              onBlur={() => commitInput('y')}
              onKeyDown={(e) => handleInputKeyDown(e, 'y')}
              onFocus={(e) => e.target.select()}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>W:</span>
            <input
              type="number"
              className="crop-input"
              value={inputValues.width}
              onChange={(e) => handleInputChange('width', e.target.value)}
              onBlur={() => commitInput('width')}
              onKeyDown={(e) => handleInputKeyDown(e, 'width')}
              onFocus={(e) => e.target.select()}
              style={inputStyle}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>H:</span>
            <input
              type="number"
              className="crop-input"
              value={inputValues.height}
              onChange={(e) => handleInputChange('height', e.target.value)}
              onBlur={() => commitInput('height')}
              onKeyDown={(e) => handleInputKeyDown(e, 'height')}
              onFocus={(e) => e.target.select()}
              style={inputStyle}
            />
          </label>
          <button
            onClick={handleLockToggle}
            style={{
              backgroundColor: lockAspectRatio ? '#4a9eff' : '#333',
              color: 'white',
              border: '1px solid #555',
              borderRadius: 3,
              padding: '0px 6px',
              fontSize: 11,
              cursor: 'pointer',
              height: 22,
              width: 28,
            }}
            title={lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          >
            {lockAspectRatio ? '🔒' : '🔓'}
          </button>
          <div style={{ position: 'relative' }} ref={aspectMenuRef}>
            <button
              onClick={() => setShowAspectMenu(!showAspectMenu)}
              style={{
                backgroundColor: '#333',
                color: 'white',
                border: '1px solid #555',
                borderRadius: 3,
                padding: '0px 6px',
                fontSize: 11,
                cursor: 'pointer',
                height: 22,
                width: 28,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Aspect ratio presets"
            >
              <span style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                border: '1.5px solid white',
                borderRadius: 1,
              }} />
            </button>
            {showAspectMenu && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 4,
                  backgroundColor: 'rgba(0, 0, 0, 0.9)',
                  border: '1px solid #555',
                  borderRadius: 4,
                  overflow: 'hidden',
                  zIndex: 10,
                }}
              >
                {ASPECT_RATIO_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => applyAspectRatioPreset(preset.value)}
                    style={{
                      display: 'block',
                      width: '100%',
                      backgroundColor: 'transparent',
                      color: 'white',
                      border: 'none',
                      padding: '6px 16px',
                      fontSize: 12,
                      cursor: 'pointer',
                      textAlign: 'left',
                      whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4a9eff')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Instructions row */}
        <div style={{ textAlign: 'center', opacity: 0.8 }}>
          Press Enter to apply, Escape to cancel
        </div>
      </div>
    </div>
  )
}
