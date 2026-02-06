import { useState, useEffect } from 'react'

export interface SceneInfo {
  id: string
  name: string
  modifiedAt: string
}

interface OpenSceneDialogProps {
  isOpen: boolean
  scenes: SceneInfo[]
  openSceneIds: string[]  // Currently open scene IDs (to show as disabled/already open)
  onOpen: (sceneIds: string[]) => void
  onCancel: () => void
}

function OpenSceneDialog({
  isOpen,
  scenes,
  openSceneIds,
  onOpen,
  onCancel,
}: OpenSceneDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Reset selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set())
    }
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

  // Filter out already-open scenes and sort by most recently modified
  const closedScenes = scenes
    .filter((s) => !openSceneIds.includes(s.id))
    .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())

  const handleCheckboxChange = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleDoubleClick = (id: string) => {
    onOpen([id])
  }

  const handleOpen = () => {
    if (selectedIds.size > 0) {
      onOpen(Array.from(selectedIds))
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
          Open Scene
        </div>

        {/* Scene list */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px 0',
            minHeight: '200px',
            maxHeight: '400px',
          }}
        >
          {closedScenes.length === 0 ? (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: '#888',
              }}
            >
              All scenes are already open
            </div>
          ) : (
            closedScenes.map((scene) => (
              <div
                key={scene.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 20px',
                  cursor: 'pointer',
                  backgroundColor: selectedIds.has(scene.id) ? '#e3f2fd' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!selectedIds.has(scene.id)) {
                    e.currentTarget.style.backgroundColor = '#f5f5f5'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = selectedIds.has(scene.id) ? '#e3f2fd' : 'transparent'
                }}
                onDoubleClick={() => handleDoubleClick(scene.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(scene.id)}
                  onChange={() => handleCheckboxChange(scene.id)}
                  style={{ marginRight: '12px', cursor: 'pointer' }}
                  onClick={(e) => e.stopPropagation()}
                />
                <div
                  style={{ flex: 1 }}
                  onClick={() => handleCheckboxChange(scene.id)}
                >
                  <div style={{ fontWeight: 500 }}>{scene.name}</div>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    Modified: {formatDate(scene.modifiedAt)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer with buttons */}
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
            onClick={handleOpen}
            disabled={selectedIds.size === 0}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: selectedIds.size === 0 ? '#ccc' : '#1976d2',
              color: '#fff',
              cursor: selectedIds.size === 0 ? 'default' : 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
          >
            Open{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

export default OpenSceneDialog
