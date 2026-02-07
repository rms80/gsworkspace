import { useState, useEffect } from 'react'

const DISMISSED_KEY = 'gsworkspace-offline-splash-dismissed'

interface OfflineSplashDialogProps {
  isOpen: boolean
  onClose: () => void
  onOpenSettings: () => void
}

export function isOfflineSplashDismissed(): boolean {
  return localStorage.getItem(DISMISSED_KEY) === 'true'
}

export default function OfflineSplashDialog({ isOpen, onClose, onOpenSettings }: OfflineSplashDialogProps) {
  const [content, setContent] = useState('')
  const [doNotShowAgain, setDoNotShowAgain] = useState(false)

  // Fetch splash HTML
  useEffect(() => {
    if (!isOpen) return
    fetch(`${import.meta.env.BASE_URL}offline_splash.html`)
      .then((r) => (r.ok ? r.text() : '<p>Splash content not found.</p>'))
      .then(setContent)
      .catch(() => setContent('<p>Failed to load splash content.</p>'))
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, doNotShowAgain])

  function handleClose() {
    if (doNotShowAgain) {
      localStorage.setItem(DISMISSED_KEY, 'true')
    } else {
      localStorage.removeItem(DISMISSED_KEY)
    }
    onClose()
  }

  function handleOpenSettings() {
    handleClose()
    onOpenSettings()
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          backgroundColor: '#1e1e2e',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          width: '728px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Content */}
        <div
          style={{
            padding: '24px',
            overflow: 'auto',
            flex: 1,
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: content }} />
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 24px',
            borderTop: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#999', cursor: 'pointer', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
            <input
              type="checkbox"
              checked={doNotShowAgain}
              onChange={(e) => setDoNotShowAgain(e.target.checked)}
            />
            Do not show again
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleOpenSettings}
              style={{
                background: 'none',
                border: '1px solid #555',
                borderRadius: '4px',
                padding: '6px 14px',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#e0e0e0',
              }}
            >
              Open Settings
            </button>
            <button
              onClick={handleClose}
              style={{
                padding: '6px 20px',
                backgroundColor: '#4a90d9',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
