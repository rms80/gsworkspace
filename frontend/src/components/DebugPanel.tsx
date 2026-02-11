import { STATUS_BAR_HEIGHT } from './StatusBar'

interface DebugPanelProps {
  content: string
  onClose: () => void
  onClear: () => void
}

const DEBUG_PANEL_HEIGHT = 250

const toolbarButtonStyle: React.CSSProperties = {
  padding: '2px 8px',
  backgroundColor: 'transparent',
  border: 'none',
  color: '#888',
  cursor: 'pointer',
  fontSize: 12,
}

function DebugPanel({ content, onClose, onClear }: DebugPanelProps) {
  const handleCopy = () => {
    if (content) navigator.clipboard.writeText(content)
  }
  return (
    <div
      style={{
        position: 'fixed',
        bottom: STATUS_BAR_HEIGHT,
        left: 0,
        right: 0,
        height: DEBUG_PANEL_HEIGHT,
        backgroundColor: '#1e1e1e',
        borderTop: '1px solid #404040',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 99,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '4px 12px',
          backgroundColor: '#2d2d2d',
          borderBottom: '1px solid #404040',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#ccc', fontSize: 12, fontWeight: 500 }}>Debug Output</span>
        <div style={{ flex: 1 }} />
        <button onClick={handleCopy} style={toolbarButtonStyle} title="Copy to clipboard">
          Copy
        </button>
        <button onClick={onClear} style={toolbarButtonStyle} title="Clear output">
          Clear
        </button>
        <button onClick={onClose} style={{ ...toolbarButtonStyle, fontSize: 14 }} title="Close">
          ×
        </button>
      </div>
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: 12,
        }}
      >
        <pre
          style={{
            margin: 0,
            fontSize: 12,
            lineHeight: 1.4,
            fontFamily: 'Consolas, Monaco, monospace',
            color: '#9cdcfe',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {content || 'No debug output yet. Run an HTML Gen prompt to see the request payload.'}
        </pre>
      </div>
    </div>
  )
}

export default DebugPanel
