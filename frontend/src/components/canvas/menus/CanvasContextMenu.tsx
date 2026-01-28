import { Z_MENU } from '../../../constants/canvas'

interface CanvasContextMenuProps {
  position: { x: number; y: number }
  onPaste: () => void
}

export default function CanvasContextMenu({ position, onPaste }: CanvasContextMenuProps) {
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
        minWidth: 120,
      }}
    >
      <button
        onClick={onPaste}
        style={{
          display: 'block',
          width: '100%',
          padding: '8px 16px',
          border: 'none',
          background: 'none',
          textAlign: 'left',
          cursor: 'pointer',
          fontSize: 14,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Paste
      </button>
    </div>
  )
}
