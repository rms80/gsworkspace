import { Z_MENU } from '../../../constants/canvas'

interface SplatContextMenuProps {
  position: { x: number; y: number }
  onResetView: () => void
  onClose: () => void
}

export default function SplatContextMenu({
  position,
  onResetView,
  onClose,
}: SplatContextMenuProps) {
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
        minWidth: 120,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => { onResetView(); onClose() }}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Reset View
      </button>
    </div>
  )
}
