import { StorageMode } from '../api/storage'

interface ToolbarProps {
  onAddText: () => void
  onAddImage: (file: File) => void
  onAddPrompt: () => void
  onAddImageGenPrompt: () => void
  onAddHtmlGenPrompt: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  storageMode: StorageMode
  onStorageModeClick?: () => void
}

const storageModeInfo: Record<StorageMode, { icon: string; label: string; color: string }> = {
  online: { icon: '☁️', label: 'Online', color: '#1976d2' },
  local: { icon: '💾', label: 'Local', color: '#388e3c' },
  offline: { icon: '📴', label: 'Offline', color: '#f57c00' },
}

function Toolbar({ onAddText, onAddImage, onAddPrompt, onAddImageGenPrompt, onAddHtmlGenPrompt, onUndo, onRedo, canUndo, canRedo, storageMode, onStorageModeClick }: ToolbarProps) {
  const modeInfo = storageModeInfo[storageMode]
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    onAddImage(file)
    e.target.value = ''
  }

  return (
    <div
      style={{
        padding: '10px 20px',
        borderBottom: '1px solid #ccc',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        backgroundColor: '#f5f5f5',
        position: 'relative',
        zIndex: 50,
      }}
    >
      <button
        onClick={onAddText}
        style={{
          padding: '4px 12px',
          backgroundColor: '#fff',
          border: '1px solid #ccc',
          borderRadius: '4px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
      >
        Add Text
      </button>
      <label style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
        <span
          style={{
            padding: '4px 12px',
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          Add Image
        </span>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          style={{ display: 'none' }}
        />
      </label>
      <button
        onClick={onAddPrompt}
        style={{
          padding: '4px 12px',
          backgroundColor: '#f8f4e8',
          border: '1px solid #c9a227',
          borderRadius: '4px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
      >
        Add Prompt
      </button>
      <button
        onClick={onAddImageGenPrompt}
        style={{
          padding: '4px 12px',
          backgroundColor: '#f5f3ff',
          border: '1px solid #8b5cf6',
          borderRadius: '4px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
      >
        Add Image Prompt
      </button>
      <button
        onClick={onAddHtmlGenPrompt}
        style={{
          padding: '4px 12px',
          backgroundColor: '#ccfbf1',
          border: '1px solid #0d9488',
          borderRadius: '4px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
      >
        HTML Gen
      </button>
      <div style={{ width: '1px', height: '24px', backgroundColor: '#ccc', margin: '0 5px' }} />
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        style={{
          padding: '4px 12px',
          backgroundColor: canUndo ? '#fff' : '#f5f5f5',
          border: '1px solid #ccc',
          borderRadius: '4px',
          cursor: canUndo ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          opacity: canUndo ? 1 : 0.5,
        }}
      >
        Undo
      </button>
      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        style={{
          padding: '4px 12px',
          backgroundColor: canRedo ? '#fff' : '#f5f5f5',
          border: '1px solid #ccc',
          borderRadius: '4px',
          cursor: canRedo ? 'pointer' : 'not-allowed',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          opacity: canRedo ? 1 : 0.5,
        }}
      >
        Redo
      </button>
      <div style={{ flex: 1 }} />
      <button
        onClick={onStorageModeClick}
        title={`Storage: ${modeInfo.label} - Click to change`}
        style={{
          padding: '4px 12px',
          backgroundColor: '#fff',
          border: `1px solid ${modeInfo.color}`,
          borderRadius: '4px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          color: modeInfo.color,
        }}
      >
        <span>{modeInfo.icon}</span>
        <span>{modeInfo.label}</span>
      </button>
    </div>
  )
}

export default Toolbar
