import { useState, useRef, useEffect } from 'react'
import { config } from '../config'
import { isMuted, setMuted } from '../utils/sound'

interface MenuBarProps {
  onAddText: () => void
  onAddImage: (file: File) => void
  onAddVideo: (file: File) => void
  onAddPdf: (file: File) => void
  onAddTextFile: (file: File) => void
  onAddPrompt: () => void
  onAddImageGenPrompt: () => void
  onAddHtmlGenPrompt: () => void
  onAddCodingRobot: () => void
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
  onOpenSettings?: () => void
  onLogout?: () => void
  onNewWorkspace?: () => void
  onSwitchWorkspace?: () => void
  onResetZoom?: () => void
  onFitToView?: () => void
  serverName?: string
  workspaceName?: string
  sceneName?: string
}

interface MenuItemDef {
  label: string
  separator?: boolean
  onClick?: () => void
  disabled?: boolean
  shortcut?: string
  type?: 'file-input' | 'folder-input'
  accept?: string
  onFileSelect?: (file: File) => void
  onFolderSelect?: (files: FileList) => void
  submenu?: MenuItemDef[]
}

interface MenuDef {
  label: string
  items?: MenuItemDef[]
  minWidth?: string
  onClick?: () => void  // For menus that directly trigger an action (no submenu)
  style?: React.CSSProperties
}

function MenuBar({
  onAddText,
  onAddImage,
  onAddVideo,
  onAddPdf,
  onAddTextFile,
  onAddPrompt,
  onAddImageGenPrompt,
  onAddHtmlGenPrompt,
  onAddCodingRobot: _onAddCodingRobot,
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
  onOpenSettings,
  onLogout,
  onNewWorkspace,
  onSwitchWorkspace,
  onResetZoom,
  onFitToView,
  serverName,
  workspaceName,
  sceneName,
}: MenuBarProps) {
  const [muted, setMutedState] = useState(() => isMuted())
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null)
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
  const textFileInputRef = useRef<HTMLInputElement>(null)

  const handleImageUpload = (file: File) => {
    onAddImage(file)
  }

  const leftMenus: MenuDef[] = [
    {
      label: 'File',
      minWidth: '250px',
      items: [
        { label: 'New Scene', onClick: onNewScene },
        { label: 'Open Scene...', onClick: onOpenScene, shortcut: 'Ctrl+O' },
        { label: 'Export Scene...', onClick: onExportScene, shortcut: 'Ctrl+Shift+E' },
        { label: 'Import Scene', submenu: [
          { label: 'From Zip...', type: 'file-input', accept: '.zip', onFileSelect: onImportSceneFromZip },
          { label: 'From Folder...', type: 'folder-input', onFolderSelect: onImportSceneFromFolder },
        ]},
        ...(onNewWorkspace ? [
          { label: '', separator: true },
          { label: 'New Workspace...', onClick: onNewWorkspace },
          ...(onSwitchWorkspace ? [{ label: 'Switch Workspace...', onClick: onSwitchWorkspace, shortcut: 'Ctrl+Shift+O' }] : []),
        ] : []),
      ],
    },
    {
      label: 'Add',
      items: [
        { label: 'Text Block', onClick: onAddText, shortcut: 'T' },
        { label: 'Image', type: 'file-input', accept: 'image/*', onFileSelect: handleImageUpload },
        ...(config.features.videoSupport ? [{ label: 'Video', type: 'file-input' as const, accept: 'video/*', onFileSelect: onAddVideo }] : []),
        { label: 'PDF', type: 'file-input' as const, accept: '.pdf,application/pdf', onFileSelect: onAddPdf },
        { label: 'Text File', type: 'file-input' as const, accept: '.txt,.csv,.js,.ts,.tsx,.cs,.cpp,.h,.c,.json,.py,.md,.sh,.log,.ini,text/plain,text/csv', onFileSelect: onAddTextFile },
        { label: 'LLM Prompt', onClick: onAddPrompt },
        { label: 'ImageGen Prompt', onClick: onAddImageGenPrompt },
        { label: 'HTMLGen Prompt', onClick: onAddHtmlGenPrompt },
        // { label: 'Coding Robot', onClick: onAddCodingRobot },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', onClick: onUndo, disabled: !canUndo, shortcut: 'Ctrl+Z' },
        { label: 'Redo', onClick: onRedo, disabled: !canRedo, shortcut: 'Ctrl+Y' },
        { label: 'Settings...', onClick: onOpenSettings, shortcut: 'Ctrl+,' },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Reset Zoom', onClick: onResetZoom },
        { label: 'Fit to View', onClick: onFitToView },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Hotkey Reference', onClick: () => setHotkeyDialogOpen(true) },
      ],
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

  const toggleMute = () => {
    const next = !muted
    setMutedState(next)
    setMuted(next)
  }

  const rightMenus: MenuDef[] = [
    ...(onLogout ? [{
      label: 'Log out',
      onClick: onLogout,
      style: { backgroundColor: '#3b82f6', color: '#fff', borderRadius: '4px' },
    }] : []),
    {
      label: 'About',
      onClick: handleOpenAbout,
    },
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
      const response = await fetch(`${import.meta.env.BASE_URL}about.html`)
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
      setOpenSubmenu(null)
    } else {
      // Toggle submenu
      setOpenMenu(openMenu === menu.label ? null : menu.label)
      setOpenSubmenu(null)
    }
  }

  // Track pending file select callback for dynamic accept
  const pendingFileSelectRef = useRef<((file: File) => void) | null>(null)

  const handleItemClick = (item: MenuItemDef) => {
    if (item.disabled) return
    if (item.type === 'file-input') {
      setOpenMenu(null)
      if (item.accept === '.zip') {
        zipInputRef.current?.click()
      } else if (item.accept === 'video/*') {
        videoInputRef.current?.click()
      } else if (item.accept?.includes('.txt') || item.accept?.includes('text/plain')) {
        pendingFileSelectRef.current = item.onFileSelect || null
        if (textFileInputRef.current) {
          textFileInputRef.current.click()
        }
      } else {
        pendingFileSelectRef.current = item.onFileSelect || null
        if (fileInputRef.current) {
          fileInputRef.current.accept = item.accept || 'image/*'
          fileInputRef.current.click()
        }
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
        backgroundColor: '#2d2d2d',
        borderBottom: '1px solid #404040',
        padding: '0 8px',
        height: '32px',
        position: 'relative',
        zIndex: 60,
        fontFamily: 'sans-serif',
      }}
    >
      {leftMenus.map((menu) => (
        <div key={menu.label} style={{ position: 'relative' }}>
          <button
            onClick={() => handleMenuClick(menu)}
            style={{
              padding: '4px 12px',
              backgroundColor: openMenu === menu.label ? '#4a4a4a' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
              color: '#aaa',
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
                backgroundColor: '#3a3a3a',
                border: '1px solid #555',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                minWidth: menu.minWidth ?? '160px',
                zIndex: 200,
              }}
            >
              {menu.items.map((item, index) =>
                item.separator ? (
                  <hr key={index} style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #555' }} />
                ) : item.submenu ? (
                <div
                  key={index}
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setOpenSubmenu(item.label)}
                  onMouseLeave={() => setOpenSubmenu(null)}
                >
                  <button
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: openSubmenu === item.label ? '#4a4a4a' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '14px',
                      textAlign: 'left',
                      color: '#ddd',
                    }}
                  >
                    <span>{item.label}</span>
                    <span style={{ color: '#888', fontSize: '12px', marginLeft: '16px' }}>&#9656;</span>
                  </button>
                  {openSubmenu === item.label && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: '100%',
                        backgroundColor: '#3a3a3a',
                        border: '1px solid #555',
                        borderRadius: '4px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                        minWidth: '160px',
                        zIndex: 201,
                      }}
                    >
                      {item.submenu.map((sub, subIndex) => (
                        <button
                          key={subIndex}
                          onClick={() => handleItemClick(sub)}
                          disabled={sub.disabled}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            width: '100%',
                            padding: '8px 12px',
                            backgroundColor: 'transparent',
                            border: 'none',
                            cursor: sub.disabled ? 'default' : 'pointer',
                            fontFamily: 'inherit',
                            fontSize: '14px',
                            textAlign: 'left',
                            color: sub.disabled ? '#666' : '#ddd',
                          }}
                          onMouseEnter={(e) => {
                            if (!sub.disabled) e.currentTarget.style.backgroundColor = '#4a4a4a'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent'
                          }}
                        >
                          <span>{sub.label}</span>
                          {sub.shortcut && (
                            <span style={{ color: '#888', fontSize: '12px', marginLeft: '16px' }}>
                              {sub.shortcut}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                ) : (
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
                    color: item.disabled ? '#666' : '#ddd',
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled) {
                      e.currentTarget.style.backgroundColor = '#4a4a4a'
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
                )
              )}
            </div>
          )}
        </div>
      ))}

      {/* Centered workspace/scene info (absolutely positioned for true centering) */}
      <span style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#888',
        fontSize: '12px',
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}>
        {serverName || 'gsworkspace'}{workspaceName ? ` / ${workspaceName}` : ''}{sceneName ? ` / ${sceneName}` : ''}
      </span>
      {/* Spacer to push right menus to the right */}
      <div style={{ flex: 1 }} />

      {/* Mute toggle */}
      <button
        onClick={toggleMute}
        title={muted ? 'Unmute sounds' : 'Mute sounds'}
        style={{
          padding: '4px 8px',
          backgroundColor: 'transparent',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <svg width="16" height="14" viewBox="0 0 16 14" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M0 4.5H3.5L8 0.5V13.5L3.5 9.5H0V4.5Z"
            fill={muted ? 'none' : '#aaa'}
            stroke="#aaa"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          {!muted && (
            <>
              <path d="M10.5 3.5C11.5 4.5 12 5.8 12 7C12 8.2 11.5 9.5 10.5 10.5" stroke="#aaa" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M12.5 1.5C14 3.2 15 5 15 7C15 9 14 10.8 12.5 12.5" stroke="#aaa" strokeWidth="1.2" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>

      {rightMenus.map((menu) => (
        <div key={menu.label} style={{ position: 'relative' }}>
          <button
            onClick={() => handleMenuClick(menu)}
            style={{
              padding: '4px 12px',
              backgroundColor: openMenu === menu.label ? '#4a4a4a' : 'transparent',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: '14px',
              color: '#aaa',
              ...menu.style,
            }}
          >
            {menu.label}
          </button>

          {openMenu === menu.label && menu.items && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                backgroundColor: '#3a3a3a',
                border: '1px solid #555',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                minWidth: '160px',
                zIndex: 200,
              }}
            >
              {menu.items.map((item, index) =>
                item.separator ? (
                  <hr key={index} style={{ margin: '4px 0', border: 'none', borderTop: '1px solid #555' }} />
                ) : (
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
                    color: item.disabled ? '#666' : '#ddd',
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled) {
                      e.currentTarget.style.backgroundColor = '#4a4a4a'
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
                )
              )}
            </div>
          )}
        </div>
      ))}

      {/* Hidden file input for image/pdf upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => {
          const cb = pendingFileSelectRef.current || handleImageUpload
          handleFileChange(e, cb)
          pendingFileSelectRef.current = null
        }}
        style={{ display: 'none' }}
      />

      {/* Hidden file input for text file upload */}
      <input
        ref={textFileInputRef}
        type="file"
        accept=".txt,.csv,.js,.ts,.tsx,.cs,.cpp,.h,.c,.json,.py,.md,.sh,.log,.ini,text/plain,text/csv"
        onChange={(e) => {
          const cb = pendingFileSelectRef.current
          if (cb) handleFileChange(e, cb)
          pendingFileSelectRef.current = null
        }}
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
              backgroundColor: '#4a4a4a',
              border: '1px solid #666',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px',
              maxHeight: '80vh',
              overflow: 'auto',
              color: '#ddd',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', color: '#fff' }}>Hotkey Reference</h2>
              <button
                onClick={() => setHotkeyDialogOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                  color: '#999',
                  padding: '4px 8px',
                }}
              >
                x
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #666' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#fff' }}>Shortcut</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600, color: '#fff' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { shortcut: 'Ctrl+Z', action: 'Undo' },
                  { shortcut: 'Ctrl+Y / Ctrl+Shift+Z', action: 'Redo' },
                  { shortcut: 'Ctrl+C', action: 'Copy selected item' },
                  { shortcut: 'Ctrl+V', action: 'Paste at cursor' },
                  { shortcut: 'Delete / Backspace', action: 'Delete selected items' },
                  { shortcut: 'Escape', action: 'Deselect all / Cancel crop' },
                  { shortcut: '', action: '' },
                  { shortcut: 'T', action: 'New text block / Edit selected text' },
                  { shortcut: 'Shift+T', action: 'New text block below selected' },
                  { shortcut: 'E', action: 'Edit/crop selected item (image, video, text)' },
                  { shortcut: 'S (in crop)', action: 'Set 1:1 square aspect ratio' },
                  { shortcut: 'Y', action: 'New LLM prompt at cursor' },
                  { shortcut: 'Shift+Y', action: 'New ImageGen prompt at cursor' },
                  { shortcut: 'Ctrl+D', action: 'Download selected items' },
                  { shortcut: '', action: '' },
                  { shortcut: 'C', action: 'Center viewport at cursor' },
                  { shortcut: 'Shift+C', action: 'Center viewport on content (100%)' },
                  { shortcut: 'Shift+V', action: 'Fit all content to view' },
                  { shortcut: 'F', action: 'Center viewport on selection' },
                  { shortcut: 'Shift+F', action: 'Fit selection to view' },
                  { shortcut: '', action: '' },
                  { shortcut: 'Ctrl+O', action: 'Open Scene' },
                  { shortcut: 'Ctrl+Shift+O', action: 'Switch Workspace' },
                  { shortcut: 'Ctrl+Shift+E', action: 'Export Scene' },
                  { shortcut: 'Ctrl+,', action: 'Open Settings' },
                ].map((row, index) =>
                  row.shortcut === '' ? (
                    <tr key={index}><td colSpan={2} style={{ padding: '4px 0' }}><hr style={{ border: 'none', borderTop: '1px solid #555', margin: 0 }} /></td></tr>
                  ) : (
                    <tr key={index} style={{ borderBottom: '1px solid #555' }}>
                      <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: '13px', color: '#fff', fontWeight: 600 }}>{row.shortcut}</td>
                      <td style={{ padding: '8px 12px' }}>{row.action}</td>
                    </tr>
                  )
                )}
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
              backgroundColor: '#4a4a4a',
              border: '1px solid #666',
              borderRadius: '8px',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflow: 'auto',
              color: '#ddd',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <style>{`
              .about-content a { color: #6cb4ff; }
              .about-content a:hover { color: #9dd0ff; }
              .about-content h1 { color: #fff; }
              .about-content em { color: #aaa; }
            `}</style>
            <div className="about-content" dangerouslySetInnerHTML={{ __html: aboutContent }} />
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
