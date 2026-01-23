interface ToolbarProps {
  onAddText: () => void
  onAddImage: (src: string, width: number, height: number) => void
  onAddPrompt: () => void
  onAddImageGenPrompt: () => void
  onAddHtmlGenPrompt: () => void
  onAddTestHtml: () => void
  onDelete: () => void
  onSendToLLM: () => void
  onUndo: () => void
  onRedo: () => void
  hasSelection: boolean
  canUndo: boolean
  canRedo: boolean
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
}

function Toolbar({ onAddText, onAddImage, onAddPrompt, onAddImageGenPrompt, onAddHtmlGenPrompt, onAddTestHtml, onDelete, onSendToLLM, onUndo, onRedo, hasSelection, canUndo, canRedo, saveStatus }: ToolbarProps) {
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        onAddImage(event.target?.result as string, img.width, img.height)
      }
      img.src = event.target?.result as string
    }
    reader.readAsDataURL(file)
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
      <button
        onClick={onAddTestHtml}
        style={{
          padding: '4px 12px',
          backgroundColor: '#e8f5e9',
          border: '1px solid #4caf50',
          borderRadius: '4px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
      >
        Test HTML
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
      {saveStatus !== 'idle' && (
        <span
          style={{
            padding: '4px 12px',
            backgroundColor: saveStatus === 'saved' ? '#d4edda' : saveStatus === 'error' ? '#f8d7da' : '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            fontSize: '13px',
            color: saveStatus === 'error' ? '#721c24' : '#666',
          }}
        >
          {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : 'Save error'}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {hasSelection && (
        <>
          <button onClick={onDelete}>Delete Selected</button>
          <button onClick={onSendToLLM} style={{ backgroundColor: '#4a90d9', color: 'white' }}>
            Send to LLM
          </button>
        </>
      )}
    </div>
  )
}

export default Toolbar
