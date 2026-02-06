import { useState, useEffect, useRef } from 'react'
import { Scene } from '../types'
import { listScenes } from '../api/scenes'
import type { SceneMetadata } from '../api/scenes'

interface TabBarProps {
  scenes: Scene[]
  activeSceneId: string | null
  onSelectScene: (id: string) => void
  onAddScene: () => void
  onRenameScene: (id: string, name: string) => void
  onCloseScene: (id: string) => void
  onDeleteScene: (id: string) => void
  onOpenScenes?: (sceneIds: string[]) => void
}

interface ContextMenuState {
  x: number
  y: number
  sceneId: string
  sceneName: string
}

function TabBar({
  scenes,
  activeSceneId,
  onSelectScene,
  onAddScene,
  onRenameScene,
  onCloseScene,
  onDeleteScene,
  onOpenScenes,
}: TabBarProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renameDialog, setRenameDialog] = useState<{ sceneId: string; currentName: string } | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [sceneDropdownOpen, setSceneDropdownOpen] = useState(false)
  const [dropdownScenes, setDropdownScenes] = useState<SceneMetadata[]>([])
  const [dropdownLoading, setDropdownLoading] = useState(false)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const dropdownButtonRef = useRef<HTMLButtonElement>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenu) return

    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }

    // Use setTimeout to avoid closing immediately from the same click that opened it
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [contextMenu])

  // Select all text when rename dialog opens
  useEffect(() => {
    if (renameDialog && renameInputRef.current) {
      renameInputRef.current.select()
    }
  }, [renameDialog])

  // Close scene dropdown when clicking outside
  useEffect(() => {
    if (!sceneDropdownOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setSceneDropdownOpen(false)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [sceneDropdownOpen])

  const handleToggleSceneDropdown = async () => {
    if (sceneDropdownOpen) {
      setSceneDropdownOpen(false)
      return
    }
    if (dropdownButtonRef.current) {
      const rect = dropdownButtonRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 2, left: rect.left })
    }
    setSceneDropdownOpen(true)
    setDropdownLoading(true)
    try {
      const allScenes = await listScenes()
      setDropdownScenes(allScenes)
    } catch {
      setDropdownScenes([])
    } finally {
      setDropdownLoading(false)
    }
  }

  const handleContextMenu = (e: React.MouseEvent, scene: Scene) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      sceneId: scene.id,
      sceneName: scene.name,
    })
  }

  const handleCloseContextMenu = () => {
    setContextMenu(null)
  }

  const handleDoubleClick = (scene: Scene) => {
    setRenameDialog({ sceneId: scene.id, currentName: scene.name })
    setRenameValue(scene.name)
  }

  const handleRenameClick = () => {
    if (!contextMenu) return
    setRenameDialog({ sceneId: contextMenu.sceneId, currentName: contextMenu.sceneName })
    setRenameValue(contextMenu.sceneName)
    setContextMenu(null)
  }

  const handleRenameSubmit = () => {
    if (renameDialog && renameValue.trim()) {
      onRenameScene(renameDialog.sceneId, renameValue.trim())
    }
    setRenameDialog(null)
    setRenameValue('')
  }

  const handleRenameCancel = () => {
    setRenameDialog(null)
    setRenameValue('')
  }

  const handleDeleteClick = () => {
    if (!contextMenu) return
    if (confirm(`Delete scene "${contextMenu.sceneName}"? This cannot be undone.`)) {
      onDeleteScene(contextMenu.sceneId)
    }
    setContextMenu(null)
  }

  const handleClose = (e: React.MouseEvent, sceneId: string) => {
    e.stopPropagation()
    onCloseScene(sceneId)
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          backgroundColor: '#e0e0e0',
          borderBottom: '1px solid #ccc',
          padding: '4px 8px 0 8px',
          gap: '4px',
          overflowX: 'auto',
          overflowY: 'hidden',
          minHeight: '28px',
          fontSize: '14px',
          position: 'relative',
          zIndex: 50,
        }}
        onClick={handleCloseContextMenu}
      >
        {scenes.map((scene) => (
          <div
            key={scene.id}
            onClick={() => onSelectScene(scene.id)}
            onDoubleClick={() => handleDoubleClick(scene)}
            onContextMenu={(e) => handleContextMenu(e, scene)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              backgroundColor: scene.id === activeSceneId ? '#fff' : '#f0f0f0',
              border: '1px solid #ccc',
              borderBottom: scene.id === activeSceneId ? '1px solid #fff' : '1px solid #ccc',
              borderRadius: '4px 4px 0 0',
              marginBottom: '-1px',
              cursor: 'pointer',
              userSelect: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <span>{scene.name}</span>
            <button
              onClick={(e) => handleClose(e, scene.id)}
              style={{
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                padding: '0 2px',
                fontSize: '12px',
                color: '#888',
                lineHeight: 1,
              }}
              title="Close scene"
            >
              x
            </button>
          </div>
        ))}
        <button
          onClick={onAddScene}
          style={{
            padding: '2px 6px',
            marginBottom: '4px',
            backgroundColor: '#f0f0f0',
            border: '1px solid #ccc',
            borderRadius: '3px',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '12px',
            lineHeight: 1,
            alignSelf: 'center',
          }}
          title="Add new scene"
        >
          +
        </button>
        {onOpenScenes && (
          <button
            ref={dropdownButtonRef}
            onClick={handleToggleSceneDropdown}
            style={{
              padding: '2px 6px',
              marginBottom: '4px',
              backgroundColor: sceneDropdownOpen ? '#e0e0e0' : '#f0f0f0',
              border: '1px solid #ccc',
              borderRadius: '3px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '12px',
              lineHeight: 1,
              alignSelf: 'center',
            }}
            title="Open scene..."
          >
            ...
          </button>
        )}
      </div>

      {/* Scene Dropdown */}
      {sceneDropdownOpen && (
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            minWidth: '180px',
            maxHeight: '300px',
            overflowY: 'auto',
            zIndex: 200,
          }}
        >
          {dropdownLoading ? (
            <div style={{ padding: '8px 12px', color: '#888', fontSize: '13px' }}>Loading...</div>
          ) : (() => {
            const openIds = new Set(scenes.map((s) => s.id))
            const closed = dropdownScenes
              .filter((s) => !openIds.has(s.id))
              .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())
            if (closed.length === 0) {
              return <div style={{ padding: '8px 12px', color: '#888', fontSize: '13px' }}>All scenes are open</div>
            }
            return closed.map((scene) => (
              <button
                key={scene.id}
                onClick={() => {
                  setSceneDropdownOpen(false)
                  onOpenScenes?.([scene.id])
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '6px 12px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#f0f0f0' }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                {scene.name}
              </button>
            ))
          })()}
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'white',
            border: '1px solid #ccc',
            borderRadius: 4,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            zIndex: 1000,
            minWidth: 120,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleRenameClick}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 14,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Rename
          </button>
          <button
            onClick={handleDeleteClick}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 16px',
              border: 'none',
              background: 'none',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: 14,
              color: '#c00',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Delete
          </button>
        </div>
      )}

      {/* Rename Dialog */}
      {renameDialog && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
          }}
          onClick={handleRenameCancel}
        >
          <div
            style={{
              background: 'white',
              padding: 20,
              borderRadius: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
              minWidth: 300,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Rename Scene</h3>
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameSubmit()
                if (e.key === 'Escape') handleRenameCancel()
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '8px 12px',
                fontSize: 14,
                border: '1px solid #ccc',
                borderRadius: 4,
                boxSizing: 'border-box',
              }}
            />
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={handleRenameCancel}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRenameSubmit}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: 4,
                  background: '#4a90d9',
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default TabBar
