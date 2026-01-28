import { ImageItem, CropRect } from '../../../types'
import { Z_MENU } from '../../../constants/canvas'

interface ImageContextMenuProps {
  position: { x: number; y: number }
  imageItem: ImageItem | undefined
  loadedImages: Map<string, HTMLImageElement>
  onUpdateItem: (id: string, changes: Partial<ImageItem>) => void
  onStartCrop: (id: string, initialCrop: CropRect) => void
  onClose: () => void
}

export default function ImageContextMenu({
  position,
  imageItem,
  loadedImages,
  onUpdateItem,
  onStartCrop,
  onClose,
}: ImageContextMenuProps) {
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
    if (!imageItem) { onClose(); return }
    onUpdateItem(imageItem.id, {
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
    })
    onClose()
  }

  const handleCrop = () => {
    if (!imageItem) { onClose(); return }
    const img = loadedImages.get(imageItem.src)
    if (!img) { onClose(); return }
    const natW = img.naturalWidth
    const natH = img.naturalHeight
    const initialCrop = imageItem.cropRect
      ? { ...imageItem.cropRect }
      : { x: 0, y: 0, width: natW, height: natH }
    onStartCrop(imageItem.id, initialCrop)
    onClose()
  }

  const handleRemoveCrop = () => {
    if (!imageItem) { onClose(); return }
    const img = loadedImages.get(imageItem.src)
    if (!img) { onClose(); return }
    const natW = img.naturalWidth
    const natH = img.naturalHeight
    const currentSourceW = imageItem.cropRect?.width ?? natW
    const displayScale = imageItem.width / currentSourceW
    const offsetX = imageItem.x - (imageItem.cropRect?.x ?? 0) * displayScale
    const offsetY = imageItem.y - (imageItem.cropRect?.y ?? 0) * displayScale
    onUpdateItem(imageItem.id, {
      x: offsetX,
      y: offsetY,
      width: natW * displayScale,
      height: natH * displayScale,
      cropRect: undefined,
      cropSrc: undefined,
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
      <button
        onClick={handleCrop}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Crop
      </button>
      {imageItem?.cropRect && (
        <button
          onClick={handleRemoveCrop}
          style={buttonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          Remove Crop
        </button>
      )}
    </div>
  )
}
