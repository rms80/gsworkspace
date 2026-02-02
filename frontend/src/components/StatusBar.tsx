import { hasAnthropicApiKey, hasGoogleApiKey } from '../utils/apiKeyStorage'

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

interface StatusBarProps {
  onToggleDebug: () => void
  debugOpen: boolean
  saveStatus: SaveStatus
  isOffline: boolean
  onSetOfflineMode: (offline: boolean) => void
  backgroundOperationsCount: number
  apiKeysVersion?: number // Used to trigger re-render when API keys change
}

export const STATUS_BAR_HEIGHT = 28

function StatusBar({ onToggleDebug, debugOpen, saveStatus, isOffline, onSetOfflineMode, backgroundOperationsCount, apiKeysVersion }: StatusBarProps) {
  // Check API key status (apiKeysVersion triggers re-check when keys change)
  void apiKeysVersion // Use to suppress unused variable warning
  const hasAnthropic = hasAnthropicApiKey()
  const hasGoogle = hasGoogleApiKey()
  const handleSwitchToOnline = async () => {
    try {
      // Check if server is available before switching
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const response = await fetch('/api/scenes', {
        method: 'GET',
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        onSetOfflineMode(false)
      } else {
        alert('Server is not responding correctly. Staying in offline mode.')
      }
    } catch {
      alert('Cannot connect to server. Staying in offline mode.')
    }
  }

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
      {isOffline ? (
        <>
          <span
            style={{
              padding: '2px 8px',
              backgroundColor: '#6366f1',
              color: '#fff',
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
            }}
            onClick={handleSwitchToOnline}
            title="Click to switch to online mode"
          >
            Offline Mode
          </span>
          {(hasAnthropic || hasGoogle) ? (
            <span
              style={{
                padding: '2px 8px',
                backgroundColor: '#374151',
                color: '#9ca3af',
                borderRadius: 3,
                fontSize: 11,
              }}
              title={`API keys configured: ${[hasAnthropic && 'Anthropic', hasGoogle && 'Google'].filter(Boolean).join(', ')}`}
            >
              {hasAnthropic && hasGoogle ? 'API Keys OK' : hasAnthropic ? 'Anthropic Key' : 'Google Key'}
            </span>
          ) : (
            <span
              style={{
                padding: '2px 8px',
                backgroundColor: '#7c2d12',
                color: '#fca5a5',
                borderRadius: 3,
                fontSize: 11,
              }}
              title="No API keys configured. AI features won't work. Add keys in Edit > Settings."
            >
              No API Keys
            </span>
          )}
        </>
      ) : (
        <span
          style={{
            padding: '2px 8px',
            backgroundColor: '#22c55e',
            color: '#fff',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
          }}
          onClick={() => onSetOfflineMode(true)}
          title="Click to go offline"
        >
          Connected
        </span>
      )}
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
      {backgroundOperationsCount > 0 && (
        <span
          style={{
            padding: '2px 8px',
            backgroundColor: '#f59e0b',
            color: '#fff',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 500,
            animation: 'pulse-bg 1.5s ease-in-out infinite',
          }}
        >
          {backgroundOperationsCount} background upload{backgroundOperationsCount !== 1 ? 's' : ''}...
        </span>
      )}
      <style>
        {`
          @keyframes pulse-bg {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `}
      </style>
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
