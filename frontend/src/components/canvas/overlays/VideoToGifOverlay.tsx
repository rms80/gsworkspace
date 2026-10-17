import { useState, useEffect } from 'react'
import { VideoToGifMode, gifOutputSize, GIF_MIN_FPS, GIF_MAX_FPS, GIF_MIN_SCALE, GIF_MAX_SCALE } from '../../../hooks/useVideoToGifMode'
import ModalBackdrop, { Z_MODAL_CONTENT, MODAL_PANEL_WIDTH, MODAL_PANEL_GAP } from './ModalBackdrop'

interface VideoToGifOverlayProps {
  convert: VideoToGifMode
  stageScale: number
  stagePos: { x: number; y: number }
}

const FPS_PRESETS = [5, 10, 15, 30]
const SCALE_PRESETS = [1, 0.75, 0.5]

/** Formats a number without a leading zero (.5, .75) to match the shortcut labels */
const short = (n: number) => String(n).replace(/^0\./, '.')

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Number field that commits on blur/Enter */
function NumberField({ value, onCommit, min, max, step }: {
  value: number
  onCommit: (n: number) => void
  min: number
  max: number
  step: number
}) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  const commit = () => {
    const n = parseFloat(text)
    if (Number.isFinite(n)) onCommit(n)
    else setText(String(value))
  }

  return (
    <input
      type="number"
      className="video-to-gif-input"
      min={min}
      max={max}
      step={step}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => { setFocused(true); e.target.select() }}
      onBlur={() => { setFocused(false); commit() }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      style={{
        width: 48,
        backgroundColor: 'white',
        color: '#333',
        border: '1px solid #555',
        borderRadius: 3,
        padding: '2px 4px',
        fontSize: 12,
        textAlign: 'right',
      }}
    />
  )
}

/**
 * Convert to GIF UI (modal): a placeholder where the GIF will be created, playing the source video
 * as a stand-in, and a panel to its right to set the frame rate and scale, with Create / Cancel.
 */
export default function VideoToGifOverlay({ convert, stageScale, stagePos }: VideoToGifOverlayProps) {
  const { session } = convert
  if (!session) return null

  const left = session.rect.x * stageScale + stagePos.x
  const top = session.rect.y * stageScale + stagePos.y
  const width = session.rect.width * stageScale
  const height = session.rect.height * stageScale

  const { preview } = session
  const output = gifOutputSize(session.sourceWidth, session.sourceHeight, session.scale)

  const smallButton = (active: boolean): React.CSSProperties => ({
    backgroundColor: active ? '#4a9eff' : '#333',
    color: 'white',
    border: '1px solid #555',
    borderRadius: 3,
    padding: '0 6px',
    fontSize: 11,
    height: 22,
    cursor: 'pointer',
  })
  const buttonStyle = (primary: boolean): React.CSSProperties => ({
    backgroundColor: primary ? '#4a9eff' : '#333',
    color: 'white',
    border: '1px solid #555',
    borderRadius: 3,
    padding: '0 12px',
    fontSize: 12,
    height: 24,
    cursor: session.creating ? 'default' : 'pointer',
  })

  return (
    <>
      <ModalBackdrop />

      {/* The GIF as it will be created (rendered with the current settings), or a spinner while it renders */}
      <div
        data-modal-panel="true"
        style={{
          position: 'absolute',
          left,
          top,
          width,
          height,
          border: '2px dashed #4a9eff',
          boxSizing: 'border-box',
          backgroundColor: '#000',
          pointerEvents: 'auto',
          zIndex: Z_MODAL_CONTENT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          color: 'white',
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        {preview ? (
          <img
            src={preview.url}
            alt=""
            draggable={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              pointerEvents: 'none',
            }}
          />
        ) : session.error ? (
          <div style={{ color: '#ff8080', padding: 12, textAlign: 'center' }}>{session.error}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                border: '3px solid rgba(255, 255, 255, 0.3)',
                borderTopColor: 'white',
                borderRadius: '50%',
                animation: 'video-to-gif-spin 1s linear infinite',
              }}
            />
            <span style={{ opacity: 0.8 }}>Rendering GIF...</span>
          </div>
        )}
      </div>

      {/* Settings panel, to the right of the placeholder */}
      <div
        style={{
          position: 'absolute',
          left: left + width + MODAL_PANEL_GAP,
          top,
          width: MODAL_PANEL_WIDTH,
          boxSizing: 'border-box',
          backgroundColor: 'rgba(0, 0, 0, 0.85)',
          borderRadius: 6,
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
          color: 'white',
          pointerEvents: session.creating ? 'none' : 'auto',
          zIndex: Z_MODAL_CONTENT,
          userSelect: 'none',
        }}
        data-modal-panel="true"
        onDragStart={(e) => e.preventDefault()}
      >
        <style>{`
          .video-to-gif-input::-webkit-outer-spin-button,
          .video-to-gif-input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          .video-to-gif-input[type=number] {
            -moz-appearance: textfield;
          }
          @keyframes video-to-gif-spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Convert to GIF</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={convert.cancel} disabled={session.creating} style={buttonStyle(false)}>
              Cancel
            </button>
            <button
              onClick={convert.finalize}
              disabled={session.creating || !preview}
              style={{ ...buttonStyle(true), opacity: preview ? 1 : 0.5, cursor: preview && !session.creating ? 'pointer' : 'default' }}
            >
              {session.creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0', opacity: session.creating ? 0.6 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 40 }}>FPS:</span>
            <NumberField value={session.fps} onCommit={convert.setFps} min={GIF_MIN_FPS} max={GIF_MAX_FPS} step={1} />
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {FPS_PRESETS.map((fps) => (
                <button key={fps} onClick={() => convert.setFps(fps)} style={smallButton(session.fps === fps)}>
                  {fps}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 40 }}>Scale:</span>
            <NumberField value={session.scale} onCommit={convert.setScale} min={GIF_MIN_SCALE} max={GIF_MAX_SCALE} step={0.05} />
            <span>x</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {SCALE_PRESETS.map((scale) => (
                <button key={scale} onClick={() => convert.setScale(scale)} style={smallButton(session.scale === scale)}>
                  {short(scale)}x
                </button>
              ))}
            </div>
          </div>
          {/* Nearest only applies when scaling up */}
          {session.scale > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => convert.setNearest(!session.nearest)}
                style={smallButton(session.nearest)}
                title="Nearest-neighbour sampling when scaling up"
              >
                Nearest
              </button>
            </div>
          )}
        </div>
        <div style={{ opacity: 0.8 }}>
          {preview
            ? `${preview.width}×${preview.height} · ${preview.frames} frames · ${preview.duration.toFixed(1)}s · ${formatFileSize(preview.fileSize)}`
            : `${output.width}×${output.height} · ${session.error ? 'render failed' : 'rendering...'}`}
        </div>
      </div>
    </>
  )
}
