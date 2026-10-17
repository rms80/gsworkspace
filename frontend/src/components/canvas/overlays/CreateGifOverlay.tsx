import { useState, useEffect } from 'react'
import { CanvasItem, ImageItem } from '../../../types'
import { GifCreateMode, GIF_MIN_DELAY_MS, GIF_MAX_DELAY_MS } from '../../../hooks/useGifCreateMode'
import ModalBackdrop, { Z_MODAL_CONTENT, MODAL_PANEL_WIDTH, MODAL_PANEL_GAP } from './ModalBackdrop'

interface CreateGifOverlayProps {
  gif: GifCreateMode
  items: CanvasItem[]
  stageScale: number
  stagePos: { x: number; y: number }
}

/** Millisecond field that updates while typing (once the value is valid) and clamps on commit */
function DelayInput({ value, onCommit, title }: { value: number | null; onCommit: (ms: number) => void; title?: string }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(value === null ? '' : String(value))
  }, [value, focused])

  const commit = () => {
    const n = parseInt(text, 10)
    if (Number.isFinite(n)) onCommit(n)
  }

  return (
    <input
      type="number"
      className="gif-delay-input"
      min={GIF_MIN_DELAY_MS}
      max={GIF_MAX_DELAY_MS}
      step={10}
      value={text}
      title={title}
      placeholder="mixed"
      onChange={(e) => {
        setText(e.target.value)
        const n = parseInt(e.target.value, 10)
        if (n >= GIF_MIN_DELAY_MS) onCommit(n)
      }}
      onFocus={(e) => { setFocused(true); e.target.select() }}
      onBlur={() => { setFocused(false); commit() }}
      onKeyDown={(e) => {
        // Enter commits the field
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          commit()
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      style={{
        width: 54,
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
 * Create GIF UI (modal): a live preview of the GIF on the canvas (where it will be created) and a
 * panel to its right to set how long each frame is shown, with Create / Cancel buttons.
 */
export default function CreateGifOverlay({ gif, items, stageScale, stagePos }: CreateGifOverlayProps) {
  const { session } = gif
  if (!session) return null

  const left = session.rect.x * stageScale + stagePos.x
  const top = session.rect.y * stageScale + stagePos.y
  const width = session.rect.width * stageScale
  const height = session.rect.height * stageScale

  const allSame = session.delays.every((d) => d === session.delays[0])
  const totalMs = session.delays.reduce((a, b) => a + b, 0)
  const frameItems = session.ids.map((id) => items.find((i) => i.id === id && i.type === 'image') as ImageItem | undefined)

  const status = session.creating
    ? 'Creating GIF...'
    : session.previewUrl === null
      ? 'Generating preview...'
      : session.previewing
        ? 'Updating preview...'
        : null

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

      {/* Preview */}
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
          backgroundColor: '#1a1a2e',
          pointerEvents: 'auto',
          zIndex: Z_MODAL_CONTENT,
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        {session.previewUrl && (
          <img
            src={session.previewUrl}
            alt=""
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        )}
        {status && (
          <div
            style={{
              position: 'absolute',
              left: 6,
              top: 6,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              color: 'white',
              borderRadius: 3,
              padding: '2px 6px',
              fontFamily: 'system-ui, sans-serif',
              fontSize: 11,
            }}
          >
            {status}
          </div>
        )}
      </div>

      {/* Timing panel, to the right of the preview (fixed screen width; scrolls if taller than the view) */}
      <div
        style={{
          position: 'absolute',
          left: left + width + MODAL_PANEL_GAP,
          top,
          width: MODAL_PANEL_WIDTH,
          maxHeight: '85vh',
          overflowY: 'auto',
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Create GIF</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={gif.cancel} disabled={session.creating} style={buttonStyle(false)}>
              Cancel
            </button>
            <button onClick={gif.finalize} disabled={session.creating} style={buttonStyle(true)}>
              {session.creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: session.creating ? 0.6 : 1 }}>
        <style>{`
          .gif-delay-input::-webkit-outer-spin-button,
          .gif-delay-input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          .gif-delay-input[type=number] {
            -moz-appearance: textfield;
          }
        `}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0' }}>
          <span>All frames:</span>
          <DelayInput value={allSame ? session.delays[0] : null} onCommit={gif.setAllDelays} title="Set every frame's display time" />
          <span>ms</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            {[500, 1000, 2000].map((ms) => {
              const active = allSame && session.delays[0] === ms
              return (
                <button
                  key={ms}
                  onClick={() => gif.setAllDelays(ms)}
                  style={{
                    backgroundColor: active ? '#4a9eff' : '#333',
                    color: 'white',
                    border: '1px solid #555',
                    borderRadius: 3,
                    padding: '0 6px',
                    fontSize: 11,
                    height: 22,
                    cursor: 'pointer',
                  }}
                  title={`Show every frame for ${ms / 1000}s`}
                >
                  {String(ms / 1000).replace(/^0\./, '.')}s
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ opacity: 0.8 }}>
          {session.ids.length} frames · {(totalMs / 1000).toFixed(2)}s · {session.width}×{session.height}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {frameItems.map((item, i) => (
            <div key={session.ids[i]} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 48, height: 30, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                {item && (
                  // Not draggable: a native image drag dropped on the canvas would import it as a new item
                  <img
                    src={item.src}
                    alt=""
                    draggable={false}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                )}
              </div>
              <span style={{ opacity: 0.6 }}>{i + 1}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {item?.name || `Frame ${i + 1}`}
              </span>
              <DelayInput value={session.delays[i]} onCommit={(ms) => gif.setDelay(i, ms)} title={`Frame ${i + 1} display time (ms)`} />
              <span style={{ opacity: 0.7 }}>ms</span>
            </div>
          ))}
        </div>
        {session.error && (
          <div style={{ color: '#ffb347' }}>{session.error}</div>
        )}
        </div>
      </div>
    </>
  )
}
