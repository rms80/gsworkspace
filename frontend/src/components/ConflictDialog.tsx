interface ConflictDialogProps {
  isOpen: boolean
  sceneName: string
  localModifiedAt: string
  remoteModifiedAt: string
  onGetRemote: () => void
  onKeepLocal: () => void
  onFork: () => void
  onCancel: () => void
}

function ConflictDialog({
  isOpen,
  sceneName,
  localModifiedAt,
  remoteModifiedAt,
  onGetRemote,
  onKeepLocal,
  onFork,
  onCancel,
}: ConflictDialogProps) {
  if (!isOpen) return null

  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
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
            color: '#d32f2f',
          }}
        >
          Scene Changed on Server
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          <p style={{ margin: '0 0 16px 0', color: '#333' }}>
            The scene <strong>"{sceneName}"</strong> has been modified on the server since you opened it.
          </p>

          <div style={{
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            padding: '12px',
            marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ color: '#666' }}>Your version:</span>
              <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(localModifiedAt)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#666' }}>Server version:</span>
              <span style={{ fontFamily: 'monospace', fontSize: '13px' }}>{formatDate(remoteModifiedAt)}</span>
            </div>
          </div>

          <p style={{ margin: '0', color: '#666', fontSize: '14px' }}>
            Choose how to resolve this conflict:
          </p>
        </div>

        {/* Footer with buttons */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            flexWrap: 'wrap',
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
            Dismiss
          </button>
          <button
            onClick={onFork}
            style={{
              padding: '8px 16px',
              border: '1px solid #1976d2',
              borderRadius: '4px',
              backgroundColor: '#fff',
              color: '#1976d2',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
            title="Create a new scene with your local changes"
          >
            Fork
          </button>
          <button
            onClick={onKeepLocal}
            style={{
              padding: '8px 16px',
              border: '1px solid #ed6c02',
              borderRadius: '4px',
              backgroundColor: '#ed6c02',
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
            title="Overwrite the server version with your local changes"
          >
            Keep Local
          </button>
          <button
            onClick={onGetRemote}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#1976d2',
              color: '#fff',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
            title="Discard your local changes and load the server version"
          >
            Get Remote
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConflictDialog
