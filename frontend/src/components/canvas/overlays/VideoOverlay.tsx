import { useRef, useState, useEffect } from 'react'
import { VideoItem } from '../../../types'

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2, 3, 4, 10, 20]

interface VideoOverlayProps {
  item: VideoItem
  stageScale: number
  stagePos: { x: number; y: number }
  isSelected: boolean
  isAnyDragActive: boolean
  onUpdateItem: (id: string, changes: Partial<VideoItem>) => void
  transform?: { x: number; y: number; width: number; height: number }
}

/**
 * HTML5 video overlay positioned over the canvas.
 * Includes playback controls when selected or hovered.
 */
export default function VideoOverlay({
  item,
  stageScale,
  stagePos,
  isSelected,
  isAnyDragActive,
  onUpdateItem,
  transform,
}: VideoOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  // Use real-time transform if available (during drag), otherwise use item state
  const scaleX = item.scaleX ?? 1
  const scaleY = item.scaleY ?? 1
  const x = transform?.x ?? item.x
  const y = transform?.y ?? item.y
  const width = transform?.width ?? item.width * scaleX
  const height = transform?.height ?? item.height * scaleY

  const displayWidth = width * stageScale
  const displayHeight = height * stageScale

  const left = x * stageScale + stagePos.x
  const top = y * stageScale + stagePos.y

  const playbackRate = item.playbackRate ?? 1

  // Sync video properties with item state
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    video.loop = item.loop ?? false
    video.muted = item.muted ?? true
    video.playbackRate = playbackRate
  }, [item.loop, item.muted, playbackRate])

  // Update time display
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleTimeUpdate = () => setCurrentTime(video.currentTime)
    const handleDurationChange = () => setDuration(video.duration)
    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)

    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('durationchange', handleDurationChange)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('durationchange', handleDurationChange)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
    }
  }, [])

  const togglePlay = () => {
    const video = videoRef.current
    if (!video) return

    if (isPlaying) {
      video.pause()
    } else {
      video.play()
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current
    if (!video) return

    const time = parseFloat(e.target.value)
    video.currentTime = time
    setCurrentTime(time)
  }

  const toggleMute = () => {
    onUpdateItem(item.id, { muted: !(item.muted ?? true) })
  }

  const toggleLoop = () => {
    onUpdateItem(item.id, { loop: !(item.loop ?? false) })
  }

  const handleSpeedChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRate = parseFloat(e.target.value)
    onUpdateItem(item.id, { playbackRate: newRate })
  }

  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Only show controls when selected and not dragging
  const controlsVisible = isSelected && !isAnyDragActive

  // If we have a cropped video file, use that. Otherwise, use the original with CSS crop.
  const videoSrc = item.cropSrc ?? item.src

  // Calculate CSS crop styling when we have cropRect but no cropSrc
  const hasCropRect = item.cropRect && !item.cropSrc
  let videoStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    backgroundColor: '#1a1a2e',
    borderRadius: 4,
    pointerEvents: 'none',
  }

  // Apply CSS-based cropping when we have cropRect but no server-generated crop
  if (hasCropRect && item.cropRect) {
    const origW = item.originalWidth ?? item.width
    const origH = item.originalHeight ?? item.height
    const cropRect = item.cropRect

    // Scale the video so the crop region fills the display area
    const videoScaleX = width / cropRect.width
    const videoScaleY = height / cropRect.height

    videoStyle = {
      ...videoStyle,
      width: origW * scaleX,
      height: origH * scaleY,
      objectFit: 'fill',
      position: 'absolute',
      left: -(cropRect.x * videoScaleX),
      top: -(cropRect.y * videoScaleY),
      transform: `scale(${videoScaleX / scaleX}, ${videoScaleY / scaleY})`,
      transformOrigin: 'top left',
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: displayWidth,
        height: displayHeight,
        overflow: hasCropRect ? 'hidden' : undefined,
        // Let clicks pass through to Konva canvas underneath
        pointerEvents: 'none',
      }}
    >
      {/* Video element - no pointer events, just displays video */}
      <video
        ref={videoRef}
        src={videoSrc}
        style={videoStyle}
        muted={item.muted ?? true}
        loop={item.loop ?? false}
        playsInline
        preload="metadata"
      />

      {/* Play indicator - shows when video is not playing and not selected */}
      {!isPlaying && !isSelected && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              width: 0,
              height: 0,
              borderTop: `${displayHeight * 0.1}px solid transparent`,
              borderBottom: `${displayHeight * 0.1}px solid transparent`,
              borderLeft: `${displayHeight * 0.15}px solid rgba(255, 255, 255, 0.3)`,
            }}
          />
        </div>
      )}

      {/* Controls overlay - only interactive part */}
      {controlsVisible && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
            padding: '20px 8px 8px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            // Controls are interactive when visible
            pointerEvents: 'auto',
          }}
        >
          {/* Seek slider */}
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            style={{
              width: '100%',
              height: 4,
              cursor: 'pointer',
              accentColor: '#4a90d9',
            }}
          />

          {/* Control buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: 16,
                padding: '2px 6px',
              }}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>

            {/* Time display */}
            <span style={{ color: 'white', fontSize: 11, fontFamily: 'monospace' }}>
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            <div style={{ flex: 1 }} />

            {/* Playback speed dropdown */}
            <select
              value={playbackRate}
              onChange={handleSpeedChange}
              style={{
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 3,
                color: 'white',
                fontSize: 11,
                padding: '2px 4px',
                cursor: 'pointer',
              }}
              title="Playback speed"
            >
              {PLAYBACK_SPEEDS.map((speed) => (
                <option key={speed} value={speed} style={{ background: '#333', color: 'white' }}>
                  {speed}x
                </option>
              ))}
            </select>

            {/* Loop toggle */}
            <button
              onClick={toggleLoop}
              style={{
                background: 'none',
                border: 'none',
                color: item.loop ? '#4a90d9' : 'white',
                cursor: 'pointer',
                fontSize: 18,
                padding: '2px 6px',
                opacity: item.loop ? 1 : 0.6,
              }}
              title={item.loop ? 'Loop: On' : 'Loop: Off'}
            >
              🔁
            </button>

            {/* Mute toggle */}
            <button
              onClick={toggleMute}
              style={{
                background: 'none',
                border: 'none',
                color: 'white',
                cursor: 'pointer',
                fontSize: 18,
                padding: '2px 6px',
              }}
              title={(item.muted ?? true) ? 'Unmute' : 'Mute'}
            >
              {(item.muted ?? true) ? '🔇' : '🔊'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
