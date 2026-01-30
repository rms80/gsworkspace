import { VideoItem } from '../../../types'
import { Z_MENU } from '../../../constants/canvas'

interface VideoContextMenuProps {
  position: { x: number; y: number }
  videoItem: VideoItem | undefined
  onUpdateItem: (id: string, changes: Partial<VideoItem>) => void
  onClose: () => void
}

export default function VideoContextMenu({
  position,
  videoItem,
  onUpdateItem,
  onClose,
}: VideoContextMenuProps) {
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

  const handleResetTransform = () => {
    if (!videoItem) { onClose(); return }
    onUpdateItem(videoItem.id, {
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    })
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
        onClick={handleResetTransform}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Reset Transform
      </button>
    </div>
  )
}
