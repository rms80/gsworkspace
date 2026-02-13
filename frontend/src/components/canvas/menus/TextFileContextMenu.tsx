import { TextFileItem } from '../../../types'
import { Z_MENU } from '../../../constants/canvas'
import { getContentData } from '../../../api/scenes'

interface TextFileContextMenuProps {
  position: { x: number; y: number }
  textFileItem: TextFileItem | undefined
  sceneId: string
  isOffline: boolean
  onClose: () => void
}

const mimeTypes: Record<string, string> = {
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  js: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  cs: 'text/plain',
  cpp: 'text/plain',
  h: 'text/plain',
  c: 'text/plain',
  py: 'text/x-python',
  md: 'text/markdown',
  sh: 'text/x-shellscript',
  log: 'text/plain',
  ini: 'text/plain',
}

async function getBlob(textFileItem: TextFileItem, sceneId: string): Promise<Blob> {
  if (textFileItem.src.startsWith('data:') || textFileItem.src.startsWith('blob:')) {
    const response = await fetch(textFileItem.src)
    return response.blob()
  }
  return getContentData(sceneId, textFileItem.id, 'text-file')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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

  const ext = textFileItem?.fileFormat || 'txt'
  const filename = `${textFileItem?.name || 'document'}.${ext}`
  const mime = mimeTypes[ext] || 'text/plain'

  const handleExport = async () => {
    if (!textFileItem) { onClose(); return }

    try {
      const blob = await getBlob(textFileItem, sceneId)

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: `${ext.toUpperCase()} file`,
              accept: { [mime]: [`.${ext}`] },
            }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          onClose()
          return
        } catch (err) {
          if ((err as Error).name === 'AbortError') {
            onClose()
            return
          }
        }
      }

      // Fallback
      downloadBlob(blob, filename)
    } catch (error) {
      console.error('Failed to export text file:', error)
      alert('Failed to export file. Please try again.')
    }

    onClose()
  }

  const handleDownload = async () => {
    if (!textFileItem) { onClose(); return }

    try {
      const blob = await getBlob(textFileItem, sceneId)
      downloadBlob(blob, filename)
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
