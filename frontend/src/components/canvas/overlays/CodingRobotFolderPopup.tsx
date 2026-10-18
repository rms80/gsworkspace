import { useEffect, useRef, useState } from 'react'
import { Z_IFRAME_OVERLAY } from '../../../constants/canvas'
import { normalizeFolder } from '../../../utils/robotFolder'

const POPUP_WIDTH = 380

interface CodingRobotFolderPopupProps {
  /** The folder now set; '' for a folder of the session's own */
  current: string
  /** Screen position of the robot's body (under its header) */
  anchor: { left: number; top: number; width: number }
  /** Shown above the field, e.g. why the folder dialog couldn't open */
  notice: string | null
  /** edit: type the path; locked: the session has started, so it can't change; message: just the notice */
  mode: 'edit' | 'locked' | 'message'
  onApply: (folder: string) => void
  onClose: () => void
}

/**
 * Edits a Coding Robot's working folder by typing its path: used when the server can't show a
 * folder dialog, and from the robot's ... menu.
 */
export default function CodingRobotFolderPopup({ current, anchor, notice, mode, onApply, onClose }: CodingRobotFolderPopupProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(current)

  // Close on click outside
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  const apply = (folder: string) => {
    const normalized = normalizeFolder(folder)
    if (normalized !== current) onApply(normalized)
    onClose()
  }

  const buttonStyle = (primary: boolean): React.CSSProperties => ({
    backgroundColor: primary ? '#4a9eff' : '#333',
    color: 'white',
    border: '1px solid #555',
    borderRadius: 3,
    padding: '0 10px',
    fontSize: 12,
    height: 24,
    cursor: 'pointer',
  })

  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
      style={{
        position: 'absolute',
        left: Math.max(4, anchor.left + anchor.width - POPUP_WIDTH),
        top: anchor.top + 4,
        width: POPUP_WIDTH,
        boxSizing: 'border-box',
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.35)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 12,
        color: 'white',
        pointerEvents: 'auto',
        zIndex: Z_IFRAME_OVERLAY + 1,
      }}
    >
      <div style={{ fontWeight: 600 }}>Agent folder</div>
      {notice && <div style={{ color: '#ffb347', lineHeight: 1.4 }}>{notice}</div>}
      {mode !== 'edit' ? (
        <>
          {mode === 'locked' && (
            <div style={{ opacity: 0.85, lineHeight: 1.4 }}>
              The folder is set when the session starts. To change it, choose New Session from the ... menu first.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button autoFocus onClick={onClose} style={buttonStyle(true)}>OK</button>
          </div>
        </>
      ) : (
        <>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply(value)
            }}
            onFocus={(e) => e.target.select()}
            placeholder="e.g. D:/projects/my-app"
            spellCheck={false}
            style={{
              backgroundColor: 'white',
              color: '#333',
              border: '1px solid #555',
              borderRadius: 3,
              padding: '4px 6px',
              fontSize: 12,
              fontFamily: '"Cascadia Code", "Consolas", monospace',
            }}
          />
          <div style={{ opacity: 0.7, lineHeight: 1.4 }}>
            An existing folder on the server, as an absolute path. Leave it empty to give the session a new folder of its own.
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={() => apply('')} disabled={!current} style={{ ...buttonStyle(false), opacity: current ? 1 : 0.5, cursor: current ? 'pointer' : 'default' }}>
              Use Own Folder
            </button>
            <button onClick={onClose} style={buttonStyle(false)}>Cancel</button>
            <button onClick={() => apply(value)} style={buttonStyle(true)}>Set</button>
          </div>
        </>
      )}
    </div>
  )
}
