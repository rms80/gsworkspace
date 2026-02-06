import { useState, useEffect } from 'react'

const WORKSPACE_RE = /^[a-zA-Z0-9_-]{1,64}$/

interface NewWorkspaceDialogProps {
  isOpen: boolean
  onSubmit: (name: string, hidden: boolean) => void
  onCancel: () => void
}

function NewWorkspaceDialog({ isOpen, onSubmit, onCancel }: NewWorkspaceDialogProps) {
  const [name, setName] = useState('')
  const [hidden, setHidden] = useState(false)
  const [error, setError] = useState('')

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setName('')
      setHidden(false)
      setError('')
    }
  }, [isOpen])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  const validate = (value: string): string => {
    if (!value) return 'Name is required'
    if (!WORKSPACE_RE.test(value)) return 'Must be 1-64 characters: letters, numbers, hyphens, underscores'
    return ''
  }

  const handleSubmit = () => {
    const validationError = validate(name)
    if (validationError) {
      setError(validationError)
      return
    }
    onSubmit(name, hidden)
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
          maxWidth: '500px',
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
          New Workspace
        </div>

        {/* Body */}
        <div style={{ padding: '20px' }}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>
              Workspace Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError('')
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit()
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                border: error ? '1px solid #d32f2f' : '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
              placeholder="my-workspace"
            />
            {error && (
              <div style={{ color: '#d32f2f', fontSize: '12px', marginTop: '4px' }}>
                {error}
              </div>
            )}
            <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>
              Letters, numbers, hyphens, and underscores only (1-64 characters)
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
                style={{ marginRight: '8px' }}
              />
              <span>Hidden workspace</span>
            </label>
            <div style={{ color: '#888', fontSize: '12px', marginTop: '4px', marginLeft: '24px' }}>
              Hidden workspaces are not shown in the workspace list by default
            </div>
          </div>
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
            onClick={handleSubmit}
            disabled={!name}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: !name ? '#ccc' : '#1976d2',
              color: '#fff',
              cursor: !name ? 'default' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  )
}

export default NewWorkspaceDialog
