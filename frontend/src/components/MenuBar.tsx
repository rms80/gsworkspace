import { useState, useRef, useEffect } from 'react'
import { config } from '../config'

interface MenuBarProps {
  onAddText: () => void
  onAddImage: (src: string, width: number, height: number) => void
  onAddVideo: (file: File) => void
  onAddPrompt: () => void
  onAddImageGenPrompt: () => void
  onAddHtmlGenPrompt: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onNewScene: () => void
  onOpenScene: () => void
  onExportScene: () => void
  onImportSceneFromZip: (file: File) => void
  onImportSceneFromFolder: (files: FileList) => void
  onGetSceneJson?: () => string
  onGetServerSceneJson?: () => Promise<string>
  onGetHistoryJson?: () => string
  onClearHistory?: () => void
}

interface MenuItemDef {
  label: string
  onClick?: () => void
  disabled?: boolean
  shortcut?: string
  type?: 'file-input' | 'folder-input'
  accept?: string
  onFileSelect?: (file: File) => void
  onFolderSelect?: (files: FileList) => void
}

interface MenuDef {
  label: string
  items?: MenuItemDef[]
  onClick?: () => void  // For menus that directly trigger an action (no submenu)
}

function MenuBar({
  onAddText,
  onAddImage,
  onAddVideo,
  onAddPrompt,
  onAddImageGenPrompt,
  onAddHtmlGenPrompt,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onNewScene,
  onOpenScene,
  onExportScene,
  onImportSceneFromZip,
  onImportSceneFromFolder,
  onGetSceneJson,
  onGetServerSceneJson,
  onGetHistoryJson,
  onClearHistory,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [hotkeyDialogOpen, setHotkeyDialogOpen] = useState(false)
  const [aboutDialogOpen, setAboutDialogOpen] = useState(false)
  const [aboutContent, setAboutContent] = useState('')
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false)
  const [jsonDialogTitle, setJsonDialogTitle] = useState('')
  const [jsonDialogContent, setJsonDialogContent] = useState('')
  const [jsonViewMode, setJsonViewMode] = useState<'local' | 'server'>('local')
  const [localJsonContent, setLocalJsonContent] = useState('')
  const [serverJsonContent, setServerJsonContent] = useState('')
  const [serverJsonLoading, setServerJsonLoading] = useState(false)
  const menuBarRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const zipInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        onAddImage(event.target?.result as string, img.width, img.height)
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
  }

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New Scene', onClick: onNewScene },
        { label: 'Open Scene...', onClick: onOpenScene },
        { label: 'Export Scene...', onClick: onExportScene },
        { label: 'Import Scene from Zip...', type: 'file-input', accept: '.zip', onFileSelect: onImportSceneFromZip },
        { label: 'Import Scene from Folder...', type: 'folder-input', onFolderSelect: onImportSceneFromFolder },
      ],
    },
    {
      label: 'Add',
      items: [
        { label: 'Text Block', onClick: onAddText },
        { label: 'Image', type: 'file-input', accept: 'image/*', onFileSelect: handleImageUpload },
        ...(config.features.videoSupport ? [{ label: 'Video', type: 'file-input' as const, accept: 'video/*', onFileSelect: onAddVideo }] : []),
        { label: 'LLM Prompt', onClick: onAddPrompt },
        { label: 'ImageGen Prompt', onClick: onAddImageGenPrompt },
        { label: 'HTMLGen Prompt', onClick: onAddHtmlGenPrompt },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', onClick: onUndo, disabled: !canUndo, shortcut: 'Ctrl+Z' },
        { label: 'Redo', onClick: onRedo, disabled: !canRedo, shortcut: 'Ctrl+Y' },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Hotkey Reference', onClick: () => setHotkeyDialogOpen(true) },
      ],
    },
    {
      label: 'About',
      onClick: handleOpenAbout,
    },
    ...(config.features.debugMenu ? [{
      label: 'Debug',
      items: [
        { label: 'Show Scene JSON', onClick: handleShowSceneJson },
        { label: 'Show History JSON', onClick: handleShowHistoryJson },
        { label: 'Clear History', onClick: handleClearHistory },
      ],
    }] : []),
  ]

  async function handleShowSceneJson() {
    if (onGetSceneJson) {
      const localJson = onGetSceneJson()
      setJsonDialogTitle('Scene JSON')
      setLocalJsonContent(localJson)
      setJsonDialogContent(localJson)
      setJsonViewMode('local')
      setServerJsonContent('')
      setJsonDialogOpen(true)

      // Fetch server JSON in background
      if (onGetServerSceneJson) {
        setServerJsonLoading(true)
        try {
          const serverJson = await onGetServerSceneJson()
          setServerJsonContent(serverJson)
        } catch (err) {
          setServerJsonContent(`Error fetching server JSON: ${err}`)
        } finally {
          setServerJsonLoading(false)
        }
      }
    }
  }

  function handleShowHistoryJson() {
    if (onGetHistoryJson) {
      setJsonDialogTitle('History JSON')
      setJsonDialogContent(onGetHistoryJson())
      setJsonDialogOpen(true)
    }
  }

  function handleClearHistory() {
    if (onClearHistory) {
      onClearHistory()
    }
  }

  function handleJsonViewModeChange(mode: 'local' | 'server') {
    setJsonViewMode(mode)
    if (mode === 'local') {
      setJsonDialogContent(localJsonContent)
    } else {
      setJsonDialogContent(serverJsonLoading ? 'Loading...' : serverJsonContent)
    }
  }

  async function handleOpenAbout() {
    try {
      const response = await fetch('/about.html')
      if (response.ok) {
        const html = await response.text()
        setAboutContent(html)
      } else {
        setAboutContent('<p>About content not found.</p>')
      }
    } catch {
      setAboutContent('<p>Failed to load about content.</p>')
    }
    setAboutDialogOpen(true)
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dialogs on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (aboutDialogOpen) {
          setAboutDialogOpen(false)
        }
        if (jsonDialogOpen) {
          setJsonDialogOpen(false)
        }
        if (hotkeyDialogOpen) {
          setHotkeyDialogOpen(false)
        }
      }
    }
    if (aboutDialogOpen || jsonDialogOpen || hotkeyDialogOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [aboutDialogOpen, jsonDialogOpen, hotkeyDialogOpen])

  const handleMenuClick = (menu: MenuDef) => {
    if (menu.onClick) {
      // Direct action menu - no submenu
      menu.onClick()
      setOpenMenu(null)
    } else {
      // Toggle submenu
      setOpenMenu(openMenu === menu.label ? null : menu.label)
    }
  }

  const handleItemClick = (item: MenuItemDef) => {
    if (item.disabled) return
    if (item.type === 'file-input') {
      setOpenMenu(null)
      if (item.accept === '.zip') {
        zipInputRef.current?.click()
      } else if (item.accept === 'video/*') {
        videoInputRef.current?.click()
      } else {
        fileInputRef.current?.click()
      }
      return
    }
    if (item.type === 'folder-input') {
      setOpenMenu(null)
      folderInputRef.current?.click()
      return
    }
    item.onClick?.()
    setOpenMenu(null)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, onFileSelect?: (file: File) => void) => {
    const file = e.target.files?.[0]
    if (file && onFileSelect) {
      onFileSelect(file)
    }
    e.target.value = ''
    setOpenMenu(null)
  }

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onImportSceneFromZip(file)
    }
    e.target.value = ''
    setOpenMenu(null)
  }

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      onImportSceneFromFolder(files)
    }
    e.target.value = ''
    setOpenMenu(null)
  }

  return (
    <div
      ref={menuBarRef}
      style={{
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#f5f5f5',
        borderBottom: '1px solid #ccc',
        padding: '0 8px',
        height: '32px',
        position: 'relative',
        zIndex: 60,
      }}
    >
      {menus.map((menu) => (
        <div key={menu.label} style={{ position: 'relative' }}>
          <button
            onClick={() => handleMenuClick(menu)}
            style={{
              padding: '4px 12px',
              backgroundColor: openMenu === menu.label ? '#e0e0e0' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
            }}
          >
            {menu.label}
          </button>

          {openMenu === menu.label && menu.items && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                backgroundColor: '#fff',
                border: '1px solid #ccc',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                minWidth: '160px',
                zIndex: 200,
              }}
            >
              {menu.items.map((item, index) => (
                <button
                  key={index}
                  onClick={() => handleItemClick(item)}
                  disabled={item.disabled}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    cursor: item.disabled ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    textAlign: 'left',
                    color: item.disabled ? '#aaa' : '#333',
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled) {
                      e.currentTarget.style.backgroundColor = '#f0f0f0'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <span style={{ color: '#888', fontSize: '12px', marginLeft: '16px' }}>
                      {item.shortcut}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}

      {/* Hidden file input for image upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => handleFileChange(e, handleImageUpload)}
        style={{ display: 'none' }}
      />

      {/* Hidden file input for video upload */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        onChange={(e) => handleFileChange(e, onAddVideo)}
        style={{ display: 'none' }}
      />

      {/* Hidden file input for ZIP import */}
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        onChange={handleZipChange}
        style={{ display: 'none' }}
      />

      {/* Hidden folder input for directory import */}
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is not in the type definitions
        webkitdirectory=""
        onChange={handleFolderChange}
        style={{ display: 'none' }}
      />

      {/* Hotkey Reference Dialog */}
      {hotkeyDialogOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setHotkeyDialogOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Hotkey Reference</h2>
              <button
                onClick={() => setHotkeyDialogOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '4px 8px',
                }}
              >
                x
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Shortcut</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { shortcut: 'Ctrl+Z', action: 'Undo' },
                  { shortcut: 'Ctrl+Y', action: 'Redo' },
                  { shortcut: 'Ctrl+Shift+Z', action: 'Redo' },
                  { shortcut: 'Ctrl+O', action: 'Open Scene' },
                  { shortcut: 'Ctrl+Shift+E', action: 'Export Scene' },
                  { shortcut: 'Ctrl+C', action: 'Copy selected item' },
                  { shortcut: 'Ctrl+V', action: 'Paste at cursor' },
                  { shortcut: 'T', action: 'New text block at cursor (when nothing selected)' },
                  { shortcut: 'Delete / Backspace', action: 'Delete selected items' },
                  { shortcut: 'Escape', action: 'Deselect all / Cancel crop' },
                ].map((row, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '13px' }}>{row.shortcut}</td>
                    <td style={{ padding: '8px 12px' }}>{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* About Dialog */}
      {aboutDialogOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setAboutDialogOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>About</h2>
              <button
                onClick={() => setAboutDialogOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#666',
                  padding: '4px 8px',
                }}
              >
                x
              </button>
            </div>
            <div dangerouslySetInnerHTML={{ __html: aboutContent }} />
          </div>
        </div>
      )}

      {/* JSON Viewer Dialog */}
      {jsonDialogOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setJsonDialogOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
              padding: '24px',
              width: '80vw',
              maxWidth: '900px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>{jsonDialogTitle}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {jsonDialogTitle === 'Scene JSON' && onGetServerSceneJson && (
                  <div style={{ display: 'flex', backgroundColor: '#e0e0e0', borderRadius: '4px', padding: '2px' }}>
                    <button
                      onClick={() => handleJsonViewModeChange('local')}
                      style={{
                        padding: '4px 12px',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        backgroundColor: jsonViewMode === 'local' ? '#fff' : 'transparent',
                        boxShadow: jsonViewMode === 'local' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      Local
                    </button>
                    <button
                      onClick={() => handleJsonViewModeChange('server')}
                      style={{
                        padding: '4px 12px',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        backgroundColor: jsonViewMode === 'server' ? '#fff' : 'transparent',
                        boxShadow: jsonViewMode === 'server' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                      }}
                    >
                      Server {serverJsonLoading && '...'}
                    </button>
                  </div>
                )}
                <button
                  onClick={() => setJsonDialogOpen(false)}
                  style={{
                    border: 'none',
                    background: 'none',
                    fontSize: '20px',
                    cursor: 'pointer',
                    color: '#666',
                    padding: '4px 8px',
                  }}
                >
                  x
                </button>
              </div>
            </div>
            <pre
              style={{
                flex: 1,
                overflow: 'auto',
                backgroundColor: '#1e1e1e',
                color: '#d4d4d4',
                padding: '16px',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {jsonDialogContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default MenuBar
