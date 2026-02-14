import { TextFileItem } from '../../../types'
import { Z_MENU } from '../../../constants/canvas'
import { downloadTextFile, exportTextFile } from '../../../utils/downloadItem'

interface TextFileContextMenuProps {
  position: { x: number; y: number }
  textFileItem: TextFileItem | undefined
  sceneId: string
  isOffline: boolean
  onClose: () => void
}

export default function TextFileContextMenu({
  position,
  textFileItem,
  sceneId,
  isOffline: _isOffline,
  onClose,
}: TextFileContextMenuProps) {
  const buttonStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '5px 12px',
    border: 'none',
    background: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: 12,
    color: '#ddd',
  }

  const handleExport = async () => {
    if (!textFileItem) { onClose(); return }
    try {
      await exportTextFile(textFileItem, sceneId)
    } catch (error) {
      console.error('Failed to export text file:', error)
      alert('Failed to export file. Please try again.')
    }
    onClose()
  }

  const handleDownload = async () => {
    if (!textFileItem) { onClose(); return }
    try {
      await downloadTextFile(textFileItem, sceneId)
    } catch (error) {
      console.error('Failed to download text file:', error)
      alert('Failed to download file. Please try again.')
    }
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        background: '#3a3a3a',
        border: '1px solid #555',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        zIndex: Z_MENU,
        minWidth: 150,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={handleExport}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Export
      </button>
      <button
        onClick={handleDownload}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Download
      </button>
    </div>
  )
}
