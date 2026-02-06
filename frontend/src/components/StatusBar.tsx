import { useState, useEffect, useRef } from 'react'
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
  onStorageModeSync?: (mode: StorageMode) => void
  onStorageModeChange?: (mode: StorageMode) => void
  serverName?: string
}

const storageModeDisplay: Record<StorageMode, { label: string; icon: string; bg: string }> = {
  online: { label: 'Online (S3)', icon: '☁️', bg: '#22c55e' },
  local: { label: 'Local Disk', icon: '💾', bg: '#3b82f6' },
  offline: { label: 'Offline', icon: '📴', bg: '#6366f1' },
}

export const STATUS_BAR_HEIGHT = 28

type ServerStatus = 'connected' | 'misconfigured' | 'disconnected' | null

function StatusBar({ onToggleDebug, debugOpen, saveStatus, isOffline, backgroundOperationsCount, storageMode, onOpenSettings, onStorageModeSync, onStorageModeChange, serverName }: StatusBarProps) {
  const [serverStatus, setServerStatus] = useState<ServerStatus>(null)
  const [configWarning, setConfigWarning] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  useEffect(() => {
    // Skip health checks entirely in offline mode
    if (isOffline || storageMode === 'offline') {
      setServerStatus(null)
      setConfigWarning(null)
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

        if (response.ok) {
          const data = await response.json()

          // Check server status
          if (data.status === 'misconfigured') {
            setServerStatus('misconfigured')
            setConfigWarning(data.configWarning || 'Configuration issue')
          } else {
            setServerStatus('connected')
            setConfigWarning(null)
          }

          // Check if backend storage mode differs from frontend
          if (data.storageMode && data.storageMode !== storageMode) {
            console.log(`Storage mode mismatch detected: frontend=${storageMode}, backend=${data.storageMode}`)
            onStorageModeSync?.(data.storageMode)
          }
        } else {
          setServerStatus('disconnected')
          setConfigWarning(null)
        }
      } catch {
        setServerStatus('disconnected')
        setConfigWarning(null)
      }
    }

    checkHealth()
    const interval = setInterval(checkHealth, 5000)

    return () => clearInterval(interval)
  }, [isOffline, storageMode, onStorageModeSync])

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
      <span style={{ color: '#666' }}>{serverName || 'gsworkspace'}</span>
      <div ref={menuRef} style={{ position: 'relative' }}>
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
          onClick={() => setMenuOpen(!menuOpen)}
          title="Click to change storage mode"
        >
          <span>{storageModeDisplay[storageMode].icon}</span>
          <span>{storageModeDisplay[storageMode].label}</span>
        </span>
        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              bottom: '100%',
              left: 0,
              marginBottom: 4,
              backgroundColor: '#3a3a3a',
              border: '1px solid #555',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              minWidth: 140,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #555',
                color: '#ccc',
                fontSize: 11,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#4a4a4a')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              onClick={() => {
                setMenuOpen(false)
                onOpenSettings?.()
              }}
            >
              Settings...
            </div>
            {(['online', 'local', 'offline'] as StorageMode[]).map((mode) => (
              <div
                key={mode}
                style={{
                  padding: '6px 12px',
                  cursor: 'pointer',
                  color: mode === storageMode ? '#fff' : '#ccc',
                  backgroundColor: mode === storageMode ? '#555' : 'transparent',
                  fontSize: 11,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                onMouseEnter={(e) => {
                  if (mode !== storageMode) e.currentTarget.style.backgroundColor = '#4a4a4a'
                }}
                onMouseLeave={(e) => {
                  if (mode !== storageMode) e.currentTarget.style.backgroundColor = 'transparent'
                }}
                onClick={() => {
                  setMenuOpen(false)
                  if (mode !== storageMode) {
                    onStorageModeChange?.(mode)
                  }
                }}
              >
                <span>{storageModeDisplay[mode].icon}</span>
                <span>{storageModeDisplay[mode].label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {!isOffline && serverStatus !== null && (
        <span
          style={{
            padding: '2px 8px',
            backgroundColor:
              serverStatus === 'connected' ? '#166534' :
              serverStatus === 'misconfigured' ? '#d97706' :
              '#dc2626',
            color: '#fff',
            borderRadius: 3,
            fontSize: 11,
            fontWeight: 500,
          }}
          title={
            serverStatus === 'connected' ? 'Server is responding' :
            serverStatus === 'misconfigured' ? configWarning || 'Configuration issue' :
            'Server is not responding'
          }
        >
          {serverStatus === 'connected' ? 'Server OK' :
           serverStatus === 'misconfigured' ? 'Config Issue' :
           'No Connection'}
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
