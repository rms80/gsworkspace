interface StatusBarProps {
  onToggleDebug: () => void
  debugOpen: boolean
}

export const STATUS_BAR_HEIGHT = 28

function StatusBar({ onToggleDebug, debugOpen }: StatusBarProps) {
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
      <div style={{ flex: 1 }} />
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
