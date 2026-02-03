import { Z_MENU } from '../../../constants/canvas'
import { exportHtmlWithImages, exportMarkdownWithImages, exportHtmlZip, exportMarkdownZip, ImageNameMap } from '../../../utils/htmlExport'

interface HtmlExportMenuProps {
  position: { x: number; y: number }
  html: string
  label: string
  imageNameMap?: ImageNameMap
  onClose: () => void
}

export default function HtmlExportMenu({ position, html, label, imageNameMap, onClose }: HtmlExportMenuProps) {
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

  const handleExport = async (exportFn: (html: string, label: string, imageNameMap?: ImageNameMap) => Promise<void>) => {
    onClose()
    try {
      await exportFn(html, label, imageNameMap)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return
      }
      console.error('Export failed:', error)
      alert('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
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
        minWidth: 100,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => handleExport(exportHtmlWithImages)}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        HTML
      </button>
      <button
        onClick={() => handleExport(exportMarkdownWithImages)}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Markdown
      </button>
      <hr style={{ margin: '2px 8px', border: 'none', borderTop: '1px solid #ddd' }} />
      <button
        onClick={() => handleExport(exportHtmlZip)}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        HTML (Zip)
      </button>
      <button
        onClick={() => handleExport(exportMarkdownZip)}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Markdown (Zip)
      </button>
    </div>
  )
}
