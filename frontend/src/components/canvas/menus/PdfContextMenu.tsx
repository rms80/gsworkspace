import { PdfItem } from '../../../types'
import { Z_MENU } from '../../../constants/canvas'
import { getContentData } from '../../../api/scenes'

interface PdfContextMenuProps {
  position: { x: number; y: number }
  pdfItem: PdfItem | undefined
  sceneId: string
  isOffline: boolean
  onClose: () => void
}

async function getBlob(pdfItem: PdfItem, sceneId: string): Promise<Blob> {
  if (pdfItem.src.startsWith('data:') || pdfItem.src.startsWith('blob:')) {
    const response = await fetch(pdfItem.src)
    return response.blob()
  }
  return getContentData(sceneId, pdfItem.id, 'pdf')
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

export default function PdfContextMenu({
  position,
  pdfItem,
  sceneId,
  isOffline: _isOffline,
  onClose,
}: PdfContextMenuProps) {
  const buttonStyle: React.CSSProperties = {
    display: 'block',
    width: '100%',
    padding: '8px 16px',
    border: 'none',
    background: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: 14,
  }

  const filename = `${pdfItem?.name || 'document'}.pdf`

  const handleExport = async () => {
    if (!pdfItem) { onClose(); return }

    try {
      const blob = await getBlob(pdfItem, sceneId)

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'PDF file',
              accept: { 'application/pdf': ['.pdf'] },
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
      console.error('Failed to export PDF:', error)
      alert('Failed to export PDF. Please try again.')
    }

    onClose()
  }

  const handleDownload = async () => {
    if (!pdfItem) { onClose(); return }

    try {
      const blob = await getBlob(pdfItem, sceneId)
      downloadBlob(blob, filename)
    } catch (error) {
      console.error('Failed to download PDF:', error)
      alert('Failed to download PDF. Please try again.')
    }

    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: position.y,
        left: position.x,
        background: 'white',
        border: '1px solid #ccc',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        zIndex: Z_MENU,
        minWidth: 150,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={handleExport}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Export
      </button>
      <button
        onClick={handleDownload}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Download
      </button>
    </div>
  )
}
