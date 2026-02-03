import { useState, useEffect } from 'react'
import { StorageMode, getStorageMode, setStorageMode } from '../../api/storage'

interface BackendConfig {
  storageMode: 'online' | 'local'
  localStoragePath?: string
}

async function fetchBackendConfig(): Promise<BackendConfig | null> {
  try {
    const response = await fetch('/api/config')
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

async function setBackendStorageMode(mode: 'online' | 'local'): Promise<boolean> {
  try {
    const response = await fetch('/api/config/storage-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    return response.ok
  } catch {
    return false
  }
}

interface StorageModeOptionProps {
  mode: StorageMode
  currentMode: StorageMode
  backendMode: 'online' | 'local' | null
  title: string
  icon: string
  description: string
  details: string
  onChange: (mode: StorageMode) => void
  disabled?: boolean
}

function StorageModeOption({
  mode,
  currentMode,
  backendMode,
  title,
  icon,
  description,
  details,
  onChange,
  disabled,
}: StorageModeOptionProps) {
  const isSelected = currentMode === mode
  const isBackendMode = mode === backendMode

  return (
    <div
      onClick={() => !disabled && onChange(mode)}
      style={{
        border: `2px solid ${isSelected ? '#1976d2' : '#e0e0e0'}`,
        borderRadius: '8px',
        padding: '16px',
        marginBottom: '12px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        backgroundColor: isSelected ? '#e3f2fd' : disabled ? '#f5f5f5' : '#fff',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '24px' }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <strong style={{ fontSize: '15px' }}>{title}</strong>
            {isBackendMode && (
              <span
                style={{
                  fontSize: '11px',
                  backgroundColor: '#4caf50',
                  color: '#fff',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                Server Active
              </span>
            )}
          </div>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#666' }}>
            {description}
          </p>
        </div>
        <input
          type="radio"
          checked={isSelected}
          onChange={() => onChange(mode)}
          disabled={disabled}
          style={{ width: '18px', height: '18px' }}
        />
      </div>
      <p style={{ margin: '12px 0 0 36px', fontSize: '12px', color: '#888' }}>
        {details}
      </p>
    </div>
  )
}

interface StorageModeSettingsTabProps {
  onModeChange?: (mode: StorageMode) => void
}

export default function StorageModeSettingsTab({ onModeChange }: StorageModeSettingsTabProps) {
  const [currentMode, setCurrentMode] = useState<StorageMode>(getStorageMode())
  const [backendConfig, setBackendConfig] = useState<BackendConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSwitching, setIsSwitching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchBackendConfig().then((config) => {
      setBackendConfig(config)
      setIsLoading(false)
      // If backend is available and we're not in offline mode, sync with backend mode
      if (config && getStorageMode() !== 'offline') {
        setCurrentMode(config.storageMode)
        setStorageMode(config.storageMode)
      }
    })
  }, [])

  const handleModeChange = async (newMode: StorageMode) => {
    if (newMode === currentMode) return

    setError(null)
    setIsSwitching(true)

    try {
      if (newMode === 'offline') {
        // Switching to offline mode - just update frontend
        setStorageMode('offline')
        setCurrentMode('offline')
        onModeChange?.('offline')
      } else if (currentMode === 'offline') {
        // Switching from offline to online/local - need backend
        if (!backendConfig) {
          setError('Cannot switch to server mode: backend is not available')
          setIsSwitching(false)
          return
        }
        // Switch backend mode if different
        if (backendConfig.storageMode !== newMode) {
          const success = await setBackendStorageMode(newMode)
          if (!success) {
            setError('Failed to change server storage mode')
            setIsSwitching(false)
            return
          }
          // Refresh backend config
          const config = await fetchBackendConfig()
          setBackendConfig(config)
        }
        setStorageMode(newMode)
        setCurrentMode(newMode)
        onModeChange?.(newMode)
      } else {
        // Switching between online and local - update backend
        const success = await setBackendStorageMode(newMode)
        if (!success) {
          setError('Failed to change server storage mode')
          setIsSwitching(false)
          return
        }
        // Refresh backend config
        const config = await fetchBackendConfig()
        setBackendConfig(config)
        setStorageMode(newMode)
        setCurrentMode(newMode)
        onModeChange?.(newMode)
      }
    } catch (err) {
      setError('An error occurred while changing storage mode')
      console.error(err)
    } finally {
      setIsSwitching(false)
    }
  }

  if (isLoading) {
    return <div style={{ padding: '20px', color: '#666' }}>Loading storage configuration...</div>
  }

  const backendAvailable = backendConfig !== null

  return (
    <div>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 600 }}>
        Storage Mode
      </h3>
      <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#666' }}>
        Choose where your scenes and data are stored. Each mode stores data separately.
      </p>

      {error && (
        <div
          style={{
            backgroundColor: '#ffebee',
            border: '1px solid #f44336',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '16px',
            color: '#c62828',
            fontSize: '13px',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ opacity: isSwitching ? 0.7 : 1, pointerEvents: isSwitching ? 'none' : 'auto' }}>
        <StorageModeOption
          mode="online"
          currentMode={currentMode}
          backendMode={backendConfig?.storageMode ?? null}
          title="Online (S3 Cloud)"
          icon="☁️"
          description="Store data in AWS S3 cloud storage"
          details="Best for accessing your work from multiple devices. Requires S3 configuration on the server."
          onChange={handleModeChange}
          disabled={!backendAvailable}
        />

        <StorageModeOption
          mode="local"
          currentMode={currentMode}
          backendMode={backendConfig?.storageMode ?? null}
          title="Local Disk"
          icon="💾"
          description="Store data on the server's local filesystem"
          details={
            backendConfig?.localStoragePath
              ? `Files stored in: ${backendConfig.localStoragePath}`
              : 'Best for self-hosted setups. Data stored in ~/.gsworkspace by default.'
          }
          onChange={handleModeChange}
          disabled={!backendAvailable}
        />

        <StorageModeOption
          mode="offline"
          currentMode={currentMode}
          backendMode={backendConfig?.storageMode ?? null}
          title="Offline (Browser)"
          icon="📴"
          description="Store data in your browser's IndexedDB"
          details="Works without a server. Data is private to this browser and device."
          onChange={handleModeChange}
        />
      </div>

      {!backendAvailable && (
        <div
          style={{
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '4px',
            padding: '12px',
            marginTop: '16px',
          }}
        >
          <strong style={{ color: '#856404' }}>Server Unavailable</strong>
          <p style={{ margin: '8px 0 0 0', color: '#856404', fontSize: '13px' }}>
            The backend server is not responding. Only Offline (Browser) mode is available.
            Start the backend server to use Online or Local Disk modes.
          </p>
        </div>
      )}

      <div
        style={{
          borderTop: '1px solid #e0e0e0',
          paddingTop: '16px',
          marginTop: '20px',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>
          <strong>Note:</strong> Data is stored separately in each mode. Switching modes does not
          migrate your existing scenes - they will still be available when you switch back.
        </p>
      </div>
    </div>
  )
}
