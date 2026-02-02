import { useState, useRef, useEffect, useCallback } from 'react'
import { CropRect, VideoItem } from '../../../types'

interface VideoCropOverlayProps {
  item: VideoItem
  cropRect: CropRect
  speed: number
  removeAudio: boolean
  stageScale: number
  stagePos: { x: number; y: number }
  onCropChange: (crop: CropRect) => void
  onSpeedChange: (speed: number) => void
  onRemoveAudioChange: (remove: boolean) => void
}

const SPEED_OPTIONS = [
  { value: 0.25, label: '0.25x' },
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 1.5, label: '1.5x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
  { value: 4, label: '4x' },
]

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
  speed,
  removeAudio,
  stageScale,
  stagePos,
  onCropChange,
  onSpeedChange,
  onRemoveAudioChange,
}: VideoCropOverlayProps) {
  const dragStateRef = useRef<DragState | null>(null)
  const [lockAspectRatio, setLockAspectRatio] = useState(false)
  const aspectRatioRef = useRef(cropRect.width / cropRect.height)

  // Video playback state
  const videoRef = useRef<HTMLVideoElement>(null)
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

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

  // Video playback event handlers
  useEffect(() => {
    const video = videoRef.current
    const bgVideo = bgVideoRef.current
    if (!video) return

    const handleTimeUpdate = () => setCurrentTime(video.currentTime)
    const handleDurationChange = () => setDuration(video.duration)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

    // Sync background video time with main video
    const syncBgVideo = () => {
      if (bgVideo && Math.abs(bgVideo.currentTime - video.currentTime) > 0.1) {
        bgVideo.currentTime = video.currentTime
      }
    }

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('timeupdate', syncBgVideo)
    video.addEventListener('durationchange', handleDurationChange)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('timeupdate', syncBgVideo)
      video.removeEventListener('durationchange', handleDurationChange)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [])

  const togglePlay = () => {
    const video = videoRef.current
    const bgVideo = bgVideoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
      bgVideo?.pause()
    } else {
      video.play()
      bgVideo?.play()
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    const bgVideo = bgVideoRef.current
    if (!video) return
    const newTime = parseFloat(e.target.value)
    video.currentTime = newTime
    if (bgVideo) bgVideo.currentTime = newTime
  }

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

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
      nx = Math.max(0, Math.min(nx, origW - ds.startCrop.width))
      ny = Math.max(0, Math.min(ny, origH - ds.startCrop.height))
      onCropChangeRef.current({ ...ds.startCrop, x: nx, y: ny })
    } else if (ds.type === 'handle' && ds.handlePos) {
      let { x: bx, y: by, width: bw, height: bh } = ds.startCrop
      const ar = aspectRatioRef.current
      const locked = lockAspectRatioRef.current

      switch (ds.handlePos) {
        case 'top-left':
          bw -= dx; bh -= dy
          if (locked) {
            // Use the larger change to determine new size
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
          // Center horizontally when locked
          if (locked) bx = ds.startCrop.x + (ds.startCrop.width - bw) / 2
          break
        case 'bottom':
          bh += dy
          if (locked) bw = bh * ar
          // Center horizontally when locked
          if (locked) bx = ds.startCrop.x + (ds.startCrop.width - bw) / 2
          break
        case 'left':
          bw -= dx
          if (locked) bh = bw / ar
          bx = ds.startCrop.x + ds.startCrop.width - bw
          // Center vertically when locked
          if (locked) by = ds.startCrop.y + (ds.startCrop.height - bh) / 2
          break
        case 'right':
          bw += dx
          if (locked) bh = bw / ar
          // Center vertically when locked
          if (locked) by = ds.startCrop.y + (ds.startCrop.height - bh) / 2
          break
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

    onCropChange(clampCrop(newCrop, origW, origH))
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
    setLockAspectRatio(!lockAspectRatio)
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
      }}
    >
      {/* Video at low opacity */}
      <video
        ref={bgVideoRef}
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
          ref={videoRef}
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

      {/* Control Panel */}
      <div
        style={{
          position: 'absolute',
          bottom: -100,
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
        {/* All controls in one row */}
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
              padding: '2px 6px',
              fontSize: 11,
              cursor: 'pointer',
            }}
            title={lockAspectRatio ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          >
            {lockAspectRatio ? '🔒' : '🔓'}
          </button>
          <div style={{ width: 1, height: 16, backgroundColor: '#555' }} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Speed:</span>
            <select
              value={speed}
              onChange={(e) => {
                const newSpeed = parseFloat(e.target.value)
                onSpeedChange(newSpeed)
                // Auto-enable removeAudio when speed is not 1x
                if (newSpeed !== 1) {
                  onRemoveAudioChange(true)
                }
              }}
              style={{
                backgroundColor: '#333',
                color: 'white',
                border: '1px solid #555',
                borderRadius: 3,
                padding: '2px 6px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              {SPEED_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => onRemoveAudioChange(!removeAudio)}
            style={{
              backgroundColor: removeAudio ? '#4a9eff' : '#333',
              color: 'white',
              border: '1px solid #555',
              borderRadius: 3,
              padding: '2px 8px',
              fontSize: 12,
              cursor: 'pointer',
            }}
            title={removeAudio ? 'Audio will be removed' : 'Audio will be kept'}
          >
            Mute
          </button>
        </div>
        {/* Playback controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={togglePlay}
            style={{
              background: 'none',
              border: 'none',
              color: 'white',
              cursor: 'pointer',
              fontSize: 14,
              padding: '0 4px',
            }}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            style={{
              flex: 1,
              minWidth: 120,
              height: 4,
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: 11, fontFamily: 'monospace', minWidth: 75 }}>
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
        {/* Instructions row */}
        <div style={{ textAlign: 'center', opacity: 0.8 }}>
          Press Enter to apply, Escape to cancel
        </div>
      </div>
    </div>
  )
}
