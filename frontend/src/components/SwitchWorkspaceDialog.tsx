import { useState, useEffect, useRef } from 'react'

interface WorkspaceInfo {
  name: string
  createdAt: string
}

interface SwitchWorkspaceDialogProps {
  isOpen: boolean
  currentWorkspace: string
  onSwitch: (name: string) => void
  onCancel: () => void
}

function SwitchWorkspaceDialog({
  isOpen,
  currentWorkspace,
  onSwitch,
  onCancel,
}: SwitchWorkspaceDialogProps) {
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [inputName, setInputName] = useState('')
  const [inputError, setInputError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Fetch workspace list when dialog opens
  useEffect(() => {
    if (!isOpen) return
    setInputName('')
    setInputError(null)
    setSelectedName(null)
    setLoading(true)
    fetch('/api/workspaces')
      .then((res) => res.json())
      .then((data: WorkspaceInfo[]) => {
        setWorkspaces(data.sort((a, b) => a.name.localeCompare(b.name)))
      })
      .catch(() => {
        setWorkspaces([])
      })
      .finally(() => setLoading(false))
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  // The target is whichever is active: selected list item or typed name
  const target = selectedName || inputName.trim()
  const canGo = !!target && target !== currentWorkspace && !checking

  const handleGoClick = async () => {
    if (!canGo) return

    // If a list item is selected, switch directly (no need to validate)
    if (selectedName) {
      onSwitch(selectedName)
      return
    }

    // Otherwise validate the typed name
    const name = inputName.trim()
    setInputError(null)
    setChecking(true)
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(name)}`)
      const data = await res.json()
      if (data.exists) {
        onSwitch(name)
      } else {
        setInputError(`Workspace "${name}" not found`)
      }
    } catch {
      setInputError('Failed to check workspace')
    } finally {
      setChecking(false)
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleGoClick()
    }
  }

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return isoString
    }
  }

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
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: '#fff',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          minWidth: '400px',
          maxWidth: '600px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e0e0e0',
            fontWeight: 600,
            fontSize: '16px',
          }}
        >
          Switch Workspace
        </div>

        {/* Workspace list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 0',
            minHeight: '150px',
            maxHeight: '300px',
          }}
        >
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
              Loading...
            </div>
          ) : workspaces.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>
              No workspaces found
            </div>
          ) : (
            workspaces.map((ws) => {
              const isCurrent = ws.name === currentWorkspace
              const isSelected = ws.name === selectedName
              return (
                <div
                  key={ws.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '8px 20px',
                    cursor: isCurrent ? 'default' : 'pointer',
                    color: isCurrent ? '#aaa' : '#333',
                    backgroundColor: isSelected ? '#e3f2fd' : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrent && !isSelected) e.currentTarget.style.backgroundColor = '#f5f5f5'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isSelected ? '#e3f2fd' : 'transparent'
                  }}
                  onClick={() => {
                    if (!isCurrent) {
                      setSelectedName(isSelected ? null : ws.name)
                      setInputName('')
                      setInputError(null)
                    }
                  }}
                  onDoubleClick={() => {
                    if (!isCurrent) onSwitch(ws.name)
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>
                      {ws.name}
                      {isCurrent && <span style={{ fontSize: '12px', marginLeft: '8px', color: '#aaa' }}>(current)</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: '#888' }}>
                      {ws.createdAt ? `Created: ${formatDate(ws.createdAt)}` : 'Default workspace'}
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Text input section */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #e0e0e0',
          }}
        >
          <div style={{ fontSize: '13px', color: '#666', marginBottom: '6px' }}>
            Or enter workspace name:
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputName}
            onChange={(e) => {
              setInputName(e.target.value)
              setInputError(null)
            }}
            onFocus={() => {
              setSelectedName(null)
            }}
            onKeyDown={handleInputKeyDown}
            placeholder="workspace-name"
            style={{
              width: '100%',
              padding: '6px 10px',
              border: `1px solid ${inputError ? '#ef4444' : '#ccc'}`,
              borderRadius: '4px',
              fontFamily: 'inherit',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {inputError && (
            <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }}>
              {inputError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
          }}
        >
          <button
            onClick={onCancel}
            style={{
              padding: '8px 16px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleGoClick}
            disabled={!canGo}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: canGo ? '#1976d2' : '#ccc',
              color: '#fff',
              cursor: canGo ? 'pointer' : 'default',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
          >
            {checking ? '...' : 'Go'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SwitchWorkspaceDialog
