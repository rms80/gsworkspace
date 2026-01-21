interface ToolbarProps {
  onAddText: () => void
  onAddImage: (src: string, width: number, height: number) => void
  onDelete: () => void
  onSendToLLM: () => void
  hasSelection: boolean
}

function Toolbar({ onAddText, onAddImage, onDelete, onSendToLLM, hasSelection }: ToolbarProps) {
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
        gap: '10px',
        backgroundColor: '#f5f5f5',
      }}
    >
      <button onClick={onAddText}>Add Text</button>
      <label style={{ cursor: 'pointer' }}>
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
