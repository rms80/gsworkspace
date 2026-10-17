import { useState, useEffect } from 'react'
import { CanvasItem, ImageItem, VideoItem } from '../../../types'
import { ResolutionMode, MAX_RESOLUTION_DIMENSION } from '../../../hooks/useResolutionMode'

interface SetResolutionOverlayProps {
  resolution: ResolutionMode
  items: CanvasItem[]
  stageScale: number
  stagePos: { x: number; y: number }
}

const WIDTH_PRESETS = [16, 32, 64, 128, 256, 320, 512, 640, 720, 768, 800, 1024, 1080, 1280, 1366, 1440, 1600, 1920, 2048, 2560, 3840, 4096]
const HEIGHT_PRESETS = [16, 32, 64, 128, 240, 256, 360, 480, 512, 576, 600, 720, 768, 900, 1024, 1080, 1200, 1440, 1600, 2048, 2160, 4096]

/** Screen rect of an image item's displayed content */
function screenRect(item: ImageItem | VideoItem, stageScale: number, stagePos: { x: number; y: number }) {
  return {
    left: item.x * stageScale + stagePos.x,
    top: item.y * stageScale + stagePos.y,
    width: item.width * (item.scaleX ?? 1) * stageScale,
    height: item.height * (item.scaleY ?? 1) * stageScale,
  }
}

/**
 * Set Resolution UI (images and videos): a panel under the first item with aspect-locked width/height fields,
 * width/height presets and a nearest-filtering toggle. With several images, each shows a
 * badge with its current and resulting resolution.
 */
export default function SetResolutionOverlay({ resolution, items, stageScale, stagePos }: SetResolutionOverlayProps) {
  const { session, targets, error } = resolution
  const [focused, setFocused] = useState<'width' | 'height' | null>(null)
  const [widthStr, setWidthStr] = useState('')
  const [heightStr, setHeightStr] = useState('')

  const refTarget = targets[0]
  // Show the computed values, except in the field being typed into
  useEffect(() => {
    if (!refTarget) return
    if (focused !== 'width') setWidthStr(String(refTarget.width))
    if (focused !== 'height') setHeightStr(String(refTarget.height))
  }, [refTarget?.width, refTarget?.height, focused])

  if (!session) return null
  const mediaItems = session.ids.map((id) => items.find((i) => i.id === id && (i.type === 'image' || i.type === 'video')) as ImageItem | VideoItem | undefined)
  const refItem = mediaItems[0]
  if (!refItem) return null

  const handleInput = (mode: 'width' | 'height', value: string) => {
    if (mode === 'width') setWidthStr(value)
    else setHeightStr(value)
    const n = parseInt(value, 10)
    if (n > 0) resolution.setDimension(mode, Math.min(n, MAX_RESOLUTION_DIMENSION))
  }

  const mixedAspect = session.sizes.some((s) => s.width * session.sizes[0].height !== s.height * session.sizes[0].width)
  const refRect = screenRect(refItem, stageScale, stagePos)

  const inputStyle: React.CSSProperties = {
    width: 52,
    backgroundColor: 'white',
    color: '#333',
    border: '1px solid #555',
    borderRadius: 3,
    padding: '2px 4px',
    fontSize: 12,
    textAlign: 'right',
  }
  const selectStyle: React.CSSProperties = {
    backgroundColor: '#333',
    color: 'white',
    border: '1px solid #555',
    borderRadius: 3,
    fontSize: 11,
    height: 22,
    cursor: 'pointer',
  }
  const buttonStyle = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? '#4a9eff' : '#333',
    color: 'white',
    border: '1px solid #555',
    borderRadius: 3,
    padding: '0 8px',
    fontSize: 11,
    height: 22,
    cursor: 'pointer',
  })

  return (
    <>
      {/* Per-image resolution badges */}
      {session.ids.length > 1 && mediaItems.map((item, i) => {
        if (!item) return null
        const r = screenRect(item, stageScale, stagePos)
        const from = session.sizes[i]
        const to = targets[i]
        return (
          <div
            key={`res-badge-${item.id}`}
            style={{
              position: 'absolute',
              left: r.left + 4,
              top: r.top + 4,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              color: 'white',
              borderRadius: 3,
              padding: '2px 6px',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 11,
              pointerEvents: 'none',
              zIndex: 1000,
              whiteSpace: 'nowrap',
            }}
          >
            {from.width}×{from.height} → {to.width}×{to.height}
          </div>
        )
      })}

      {/* Control panel under the first image */}
      <div
        style={{
          position: 'absolute',
          left: refRect.left + refRect.width / 2,
          top: refRect.top + refRect.height + 12,
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
          pointerEvents: 'auto',
          zIndex: 1000,
          userSelect: 'none',
        }}
      >
        <style>{`
          .resolution-input::-webkit-outer-spin-button,
          .resolution-input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          .resolution-input[type=number] {
            -moz-appearance: textfield;
          }
        `}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value=""
            onChange={(e) => resolution.setDimension('width', Number(e.target.value))}
            style={selectStyle}
            title="Common widths"
          >
            <option value="" disabled>Width</option>
            {WIDTH_PRESETS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>X:</span>
            <input
              type="number"
              className="resolution-input"
              min={1}
              value={widthStr}
              onChange={(e) => handleInput('width', e.target.value)}
              onFocus={(e) => { setFocused('width'); e.target.select() }}
              onBlur={() => setFocused(null)}
              style={inputStyle}
            />
          </label>
          <span style={{ opacity: 0.6 }}>🔒</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>Y:</span>
            <input
              type="number"
              className="resolution-input"
              min={1}
              value={heightStr}
              onChange={(e) => handleInput('height', e.target.value)}
              onFocus={(e) => { setFocused('height'); e.target.select() }}
              onBlur={() => setFocused(null)}
              style={inputStyle}
            />
          </label>
          <select
            value=""
            onChange={(e) => resolution.setDimension('height', Number(e.target.value))}
            style={selectStyle}
            title="Common heights"
          >
            <option value="" disabled>Height</option>
            {HEIGHT_PRESETS.map((h) => <option key={h} value={h}>{h}</option>)}
          </select>
          <button
            onClick={() => resolution.setNearest(!session.nearest)}
            style={buttonStyle(session.nearest)}
            title={session.nearest ? 'Nearest-neighbour filtering' : 'Smooth (Lanczos) filtering'}
          >
            Nearest
          </button>
          <button
            onClick={resolution.apply}
            disabled={!!error}
            style={{ ...buttonStyle(false), opacity: error ? 0.5 : 1, cursor: error ? 'default' : 'pointer' }}
          >
            Apply
          </button>
          <button onClick={resolution.cancel} style={buttonStyle(false)}>
            Cancel
          </button>
        </div>
        <div style={{ textAlign: 'center', opacity: 0.8, color: error ? '#ffb347' : undefined }}>
          {error ?? (
            session.ids.length === 1
              ? `${session.sizes[0].width}×${session.sizes[0].height} → ${refTarget.width}×${refTarget.height} - Enter to apply, Escape to cancel`
              : `${session.ids.length} images${mixedAspect ? ', each keeps its own aspect ratio' : ''} - Enter to apply, Escape to cancel`
          )}
        </div>
      </div>
    </>
  )
}
