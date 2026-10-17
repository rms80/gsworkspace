import { useState, useEffect } from 'react'
import { CanvasItem, VideoItem } from '../../../types'
import { VideoCreateMode, MAX_TRANSITION_SECONDS } from '../../../hooks/useVideoCreateMode'
import { ClipTransition, OutputResolution } from '../../../api/videoTools'
import ModalBackdrop, { Z_MODAL_CONTENT, MODAL_PANEL_WIDTH, MODAL_PANEL_GAP } from './ModalBackdrop'

interface CreateVideoOverlayProps {
  video: VideoCreateMode
  items: CanvasItem[]
  stageScale: number
  stagePos: { x: number; y: number }
}

const TRANSITION_LABELS: Record<ClipTransition, string> = {
  cut: 'Hard cut',
  crossfade: 'Cross-fade',
  dip: 'Dip to black',
}

const formatSeconds = (s: number) => `${s.toFixed(1)}s`

/** Seconds field that commits on blur/Enter */
function SecondsInput({ value, onCommit }: { value: number; onCommit: (s: number) => void }) {
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
      className="video-create-input"
      min={0}
      max={MAX_TRANSITION_SECONDS}
      step={0.1}
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
 * Create Video UI (modal): a playable preview of the combined video on the canvas (where it will
 * be created) and a panel to its right to choose the transition between each pair of clips, with
 * Create / Cancel buttons.
 */
export default function CreateVideoOverlay({ video, items, stageScale, stagePos }: CreateVideoOverlayProps) {
  const { session } = video
  if (!session) return null

  const left = session.rect.x * stageScale + stagePos.x
  const top = session.rect.y * stageScale + stagePos.y
  const width = session.rect.width * stageScale
  const height = session.rect.height * stageScale

  const clipItems = session.ids.map((id) => items.find((i) => i.id === id && i.type === 'video') as VideoItem | undefined)
  const hasFades = session.transitions.some((t) => t !== 'cut')

  const status = session.creating
    ? 'Rendering final video...'
    : session.previewUrl === null
      ? 'Rendering preview...'
      : session.previewing
        ? 'Updating preview...'
        : null

  const selectStyle: React.CSSProperties = {
    backgroundColor: '#333',
    color: 'white',
    border: '1px solid #555',
    borderRadius: 3,
    fontSize: 11,
    height: 22,
    cursor: 'pointer',
  }

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
          backgroundColor: '#000',
          pointerEvents: 'auto',
          zIndex: Z_MODAL_CONTENT,
        }}
        onDragStart={(e) => e.preventDefault()}
      >
        {session.previewUrl && (
          <video
            key={session.previewUrl}
            src={session.previewUrl}
            autoPlay
            loop
            muted
            controls
            playsInline
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
              pointerEvents: 'none',
            }}
          >
            {status}
          </div>
        )}
      </div>

      {/* Transitions panel, to the right of the preview (fixed screen width; scrolls if taller than the view) */}
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
          <span style={{ fontWeight: 600, fontSize: 13 }}>Create Video</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={video.cancel} disabled={session.creating} style={buttonStyle(false)}>
              Cancel
            </button>
            <button onClick={video.finalize} disabled={session.creating} style={buttonStyle(true)}>
              {session.creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: session.creating ? 0.6 : 1 }}>
        <style>{`
          .video-create-input::-webkit-outer-spin-button,
          .video-create-input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
          }
          .video-create-input[type=number] {
            -moz-appearance: textfield;
          }
        `}</style>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0' }}>
          <span>Resolution:</span>
          <select
            value={session.resolution}
            onChange={(e) => video.setResolution(e.target.value as OutputResolution)}
            style={selectStyle}
            title="Other clips are scaled to fit and letterboxed"
          >
            <option value="first">First clip</option>
            <option value="largest">Largest clip</option>
          </select>
          <span style={{ marginLeft: 'auto', opacity: hasFades ? 1 : 0.5 }}>Transitions:</span>
          <SecondsInput value={session.transitionDuration} onCommit={video.setTransitionDuration} />
          <span style={{ opacity: hasFades ? 1 : 0.5 }}>s</span>
        </div>
        <div style={{ opacity: 0.8 }}>
          {session.ids.length} clips{session.duration !== null ? ` · ${formatSeconds(session.duration)}` : ''} · {session.width}×{session.height}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {session.ids.map((id, i) => (
            <div key={id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 48, height: 30, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                  {clipItems[i] && (
                    <video
                      src={clipItems[i]!.cropSrc ?? clipItems[i]!.src}
                      muted
                      preload="metadata"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }}
                    />
                  )}
                </div>
                <span style={{ opacity: 0.6 }}>{i + 1}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{session.names[i]}</span>
                {session.clipDurations && <span style={{ opacity: 0.7 }}>{formatSeconds(session.clipDurations[i])}</span>}
              </div>
              {i < session.transitions.length && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 56 }}>
                  <span style={{ opacity: 0.6 }}>↓</span>
                  <select
                    value={session.transitions[i]}
                    onChange={(e) => video.setTransition(i, e.target.value as ClipTransition)}
                    style={selectStyle}
                  >
                    {(Object.keys(TRANSITION_LABELS) as ClipTransition[]).map((t) => (
                      <option key={t} value={t}>{TRANSITION_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
              )}
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
