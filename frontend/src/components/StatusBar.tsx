export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

interface StatusBarProps {
  onToggleDebug: () => void
  debugOpen: boolean
  saveStatus: SaveStatus
}

export const STATUS_BAR_HEIGHT = 28

function StatusBar({ onToggleDebug, debugOpen, saveStatus }: StatusBarProps) {
  const getSaveStatusDisplay = () => {
    switch (saveStatus) {
      case 'unsaved':
        return { text: 'Unsaved', bg: '#f59e0b', color: '#fff' }
      case 'saving':
        return { text: 'Saving...', bg: '#6b7280', color: '#fff' }
      case 'saved':
        return { text: 'Saved', bg: '#22c55e', color: '#fff' }
      case 'error':
        return { text: 'Save Error', bg: '#ef4444', color: '#fff' }
      default:
        return null
    }
  }

  const statusDisplay = getSaveStatusDisplay()

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: STATUS_BAR_HEIGHT,
        backgroundColor: '#2d2d2d',
        borderTop: '1px solid #404040',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 12,
        fontSize: 12,
        color: '#aaa',
        zIndex: 100,
      }}
    >
      <span style={{ color: '#666' }}>Workspaceapp</span>
      <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        {statusDisplay && (
          <span
            style={{
              padding: '2px 12px',
              backgroundColor: statusDisplay.bg,
              color: statusDisplay.color,
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 500,
            }}
          >
            {statusDisplay.text}
          </span>
        )}
      </div>
      <button
        onClick={onToggleDebug}
        style={{
          padding: '2px 8px',
          backgroundColor: debugOpen ? '#4a4a4a' : 'transparent',
          border: '1px solid #555',
          borderRadius: 3,
          color: debugOpen ? '#fff' : '#aaa',
          cursor: 'pointer',
          fontSize: 11,
        }}
      >
        Debug
      </button>
    </div>
  )
}

export default StatusBar
