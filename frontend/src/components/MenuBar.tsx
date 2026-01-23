import { useState, useRef, useEffect } from 'react'

interface MenuBarProps {
  onAddText: () => void
  onAddImage: (src: string, width: number, height: number) => void
  onAddPrompt: () => void
  onAddImageGenPrompt: () => void
  onAddHtmlGenPrompt: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
}

interface MenuItemDef {
  label: string
  onClick?: () => void
  disabled?: boolean
  shortcut?: string
  type?: 'file-input'
  accept?: string
  onFileSelect?: (file: File) => void
}

interface MenuDef {
  label: string
  items: MenuItemDef[]
}

function MenuBar({
  onAddText,
  onAddImage,
  onAddPrompt,
  onAddImageGenPrompt,
  onAddHtmlGenPrompt,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const menuBarRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      label: 'Add',
      items: [
        { label: 'Text Block', onClick: onAddText },
        { label: 'Image', type: 'file-input', accept: 'image/*', onFileSelect: handleImageUpload },
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
  ]

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

  const handleMenuClick = (menuLabel: string) => {
    setOpenMenu(openMenu === menuLabel ? null : menuLabel)
  }

  const handleItemClick = (item: MenuItemDef) => {
    if (item.disabled) return
    if (item.type === 'file-input') {
      fileInputRef.current?.click()
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

  // Find the file input item for the accept attribute
  const fileInputItem = menus
    .flatMap(m => m.items)
    .find(item => item.type === 'file-input')

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
            onClick={() => handleMenuClick(menu.label)}
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

          {openMenu === menu.label && (
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
        accept={fileInputItem?.accept}
        onChange={(e) => handleFileChange(e, fileInputItem?.onFileSelect)}
        style={{ display: 'none' }}
      />
    </div>
  )
}

export default MenuBar
