import { useState, useEffect } from 'react'
import { StorageMode } from '../api/storage'

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

interface StatusBarProps {
  onToggleDebug: () => void
  debugOpen: boolean
  saveStatus: SaveStatus
  isOffline: boolean
  onSetOfflineMode?: (offline: boolean) => void
  backgroundOperationsCount: number
  storageMode: StorageMode
  onOpenSettings?: () => void
}

const storageModeDisplay: Record<StorageMode, { label: string; icon: string; bg: string }> = {
  online: { label: 'Online (S3)', icon: '☁️', bg: '#22c55e' },
  local: { label: 'Local Disk', icon: '💾', bg: '#3b82f6' },
  offline: { label: 'Offline', icon: '📴', bg: '#6366f1' },
}

export const STATUS_BAR_HEIGHT = 28

function StatusBar({ onToggleDebug, debugOpen, saveStatus, isOffline, backgroundOperationsCount, storageMode, onOpenSettings }: StatusBarProps) {
  const [serverConnected, setServerConnected] = useState<boolean | null>(null)

  useEffect(() => {
    if (isOffline) {
      setServerConnected(null)
      return
    }

    const checkHealth = async () => {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 3000)

        const response = await fetch('/api/health', {
          method: 'GET',
          signal: controller.signal
        })
        clearTimeout(timeoutId)

        setServerConnected(response.ok)
      } catch {
        setServerConnected(false)
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 5000)

    return () => clearInterval(interval)
  }, [isOffline])

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
      <span
        style={{
          padding: '2px 8px',
          backgroundColor: storageModeDisplay[storageMode].bg,
          color: '#fff',
          borderRadius: 3,
          fontSize: 11,
          fontWeight: 500,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
        onClick={onOpenSettings}
        title="Click to change storage mode"
      >
        <span>{storageModeDisplay[storageMode].icon}</span>
        <span>{storageModeDisplay[storageMode].label}</span>
      </span>
      {!isOffline && serverConnected !== null && (
        <span
          style={{
            padding: '2px 8px',
            backgroundColor: serverConnected ? '#166534' : '#dc2626',
            color: '#fff',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 500,
          }}
          title={serverConnected ? 'Server is responding' : 'Server is not responding'}
        >
          {serverConnected ? 'Server OK' : 'No Connection'}
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
