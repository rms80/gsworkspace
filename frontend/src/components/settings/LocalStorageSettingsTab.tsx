import { useState, useEffect } from 'react'
import localforage from 'localforage'

interface StorageInfo {
  indexedDBSize: number | null
  localStorageSize: number
  sceneCount: number
}

async function getStorageInfo(): Promise<StorageInfo> {
  // Calculate localStorage size
  let localStorageSize = 0
  for (const key in localStorage) {
    if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
      localStorageSize += localStorage[key].length * 2 // UTF-16 = 2 bytes per char
    }
  }

  // Count scenes in IndexedDB
  let sceneCount = 0
  try {
    const index = await localforage.getItem<{ sceneIds: string[] }>('gsworkspace:scenes-index')
    sceneCount = index?.sceneIds?.length ?? 0
  } catch {
    // Ignore errors
  }

  // Try to get IndexedDB size using Storage API
  let indexedDBSize: number | null = null
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate()
      indexedDBSize = estimate.usage ?? null
    } catch {
      // Storage API not available or failed
    }
  }

  return { indexedDBSize, localStorageSize, sceneCount }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function LocalStorageSettingsTab() {
  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null)
  const [isClearing, setIsClearing] = useState(false)

  const refreshStorageInfo = async () => {
    const info = await getStorageInfo()
    setStorageInfo(info)
  }

  useEffect(() => {
    refreshStorageInfo()
  }, [])

  const handleClearLocalStorage = async () => {
    if (!confirm('This will clear all settings and API keys. Are you sure?')) {
      return
    }
    setIsClearing(true)
    try {
      localStorage.clear()
      await refreshStorageInfo()
      alert('localStorage cleared. Please reload the page.')
    } catch (error) {
      console.error('Failed to clear localStorage:', error)
      alert('Failed to clear localStorage')
    } finally {
      setIsClearing(false)
    }
  }

  const handleClearIndexedDB = async () => {
    if (!confirm('This will delete ALL locally stored scenes and history. This cannot be undone. Are you sure?')) {
      return
    }
    setIsClearing(true)
    try {
      await localforage.clear()
      await refreshStorageInfo()
      alert('IndexedDB cleared. Please reload the page.')
    } catch (error) {
      console.error('Failed to clear IndexedDB:', error)
      alert('Failed to clear IndexedDB')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
        Storage Usage
      </h3>

      {storageInfo ? (
        <div
          style={{
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            padding: '16px',
            marginBottom: '24px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#666' }}>localStorage:</span>
            <span style={{ fontFamily: 'monospace' }}>{formatBytes(storageInfo.localStorageSize)}</span>
          </div>
          {storageInfo.indexedDBSize !== null && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#666' }}>IndexedDB (estimated):</span>
              <span style={{ fontFamily: 'monospace' }}>{formatBytes(storageInfo.indexedDBSize)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#666' }}>Local scenes:</span>
            <span style={{ fontFamily: 'monospace' }}>{storageInfo.sceneCount}</span>
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: '24px', color: '#666' }}>Loading storage info...</div>
      )}

      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
        Clear Data
      </h3>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '8px' }}>
          <strong>Clear localStorage</strong>
        </div>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#666' }}>
          Removes all settings including API keys, open scene preferences, and other app settings.
          Does not affect scenes stored in IndexedDB.
        </p>
        <button
          onClick={handleClearLocalStorage}
          disabled={isClearing}
          style={{
            padding: '8px 16px',
            border: '1px solid #d32f2f',
            borderRadius: '4px',
            backgroundColor: '#fff',
            color: '#d32f2f',
            cursor: isClearing ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: '14px',
            opacity: isClearing ? 0.6 : 1,
          }}
        >
          {isClearing ? 'Clearing...' : 'Clear localStorage'}
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <div style={{ marginBottom: '8px' }}>
          <strong>Clear IndexedDB</strong>
        </div>
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#666' }}>
          Deletes all locally stored scenes and their history. This is useful if you want to
          start fresh or free up disk space. This cannot be undone.
        </p>
        <button
          onClick={handleClearIndexedDB}
          disabled={isClearing}
          style={{
            padding: '8px 16px',
            border: '1px solid #d32f2f',
            borderRadius: '4px',
            backgroundColor: '#d32f2f',
            color: '#fff',
            cursor: isClearing ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            fontSize: '14px',
            opacity: isClearing ? 0.6 : 1,
          }}
        >
          {isClearing ? 'Clearing...' : 'Clear IndexedDB (Delete All Scenes)'}
        </button>
      </div>

      <div
        style={{
          borderTop: '1px solid #e0e0e0',
          paddingTop: '16px',
          marginTop: '8px',
        }}
      >
        <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>
          <strong>Note:</strong> After clearing data, you may need to reload the page for
          changes to take effect.
        </p>
      </div>
    </div>
  )
}
