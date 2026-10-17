import { ImageItem, CropRect } from '../../../types'
import { Z_MENU } from '../../../constants/canvas'
import { isGifSrc } from '../../../utils/gif'
import { downloadImage, exportImage } from '../../../utils/downloadItem'

interface ImageContextMenuProps {
  position: { x: number; y: number }
  imageItem: ImageItem | undefined
  sceneId: string
  loadedImages: Map<string, HTMLImageElement>
  isOffline: boolean
  onUpdateItem: (id: string, changes: Partial<ImageItem>) => void
  onStartCrop: (id: string, initialCrop: CropRect) => void
  onDuplicate: (imageItem: ImageItem) => void
  onConvertToVideo: (imageItem: ImageItem) => void
  onBakeCrop?: (id: string) => void
  onRemoveCrop: (id: string) => void
  onSetResolution?: (id: string) => void
  onClose: () => void
}

/**
 * Gets the file extension from an image src URL
 */
export default function ImageContextMenu({
  position,
  imageItem,
  sceneId,
  loadedImages,
  isOffline,
  onUpdateItem,
  onStartCrop,
  onDuplicate,
  onConvertToVideo,
  onBakeCrop,
  onRemoveCrop,
  onSetResolution,
  onClose,
}: ImageContextMenuProps) {
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

  const handleDuplicate = () => {
    if (!imageItem) { onClose(); return }
    onDuplicate(imageItem)
    onClose()
  }

  const handleConvertToVideo = () => {
    if (!imageItem) { onClose(); return }
    onConvertToVideo(imageItem)
    onClose()
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
    onRemoveCrop(imageItem.id)
    onClose()
  }

  const handleSetResolution = () => {
    if (!imageItem) { onClose(); return }
    onSetResolution?.(imageItem.id)
    onClose()
  }

  const handleBakeCrop = () => {
    if (!imageItem) { onClose(); return }
    onBakeCrop?.(imageItem.id)
    onClose()
  }

  const handleExport = async () => {
    if (!imageItem) { onClose(); return }
    try {
      await exportImage(imageItem, sceneId)
    } catch (error) {
      console.error('Failed to export image:', error)
      alert('Failed to export image. Please try again.')
    }
    onClose()
  }

  const handleDownload = async () => {
    if (!imageItem) { onClose(); return }
    try {
      await downloadImage(imageItem, sceneId)
    } catch (error) {
      console.error('Failed to download image:', error)
      alert('Failed to download image. Please try again.')
    }
    onClose()
  }

  const separatorStyle: React.CSSProperties = {
    height: 1,
    background: '#555',
    margin: '4px 8px',
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
        onClick={handleCrop}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        {imageItem?.cropRect ? 'Edit Crop' : 'Crop'}
      </button>
      {imageItem?.cropRect && (
        <button
          onClick={handleRemoveCrop}
          style={buttonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          Remove Crop
        </button>
      )}
      {imageItem?.cropRect && onBakeCrop && (
        <button
          onClick={handleBakeCrop}
          style={buttonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          Bake Crop
        </button>
      )}
      {onSetResolution && (() => {
        const hasCrop = !!imageItem?.cropRect
        return (
          <button
            onClick={hasCrop ? undefined : handleSetResolution}
            disabled={hasCrop}
            style={{ ...buttonStyle, opacity: hasCrop ? 0.5 : 1, cursor: hasCrop ? 'not-allowed' : 'pointer' }}
            onMouseEnter={(e) => !hasCrop && (e.currentTarget.style.background = '#4a4a4a')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            title={hasCrop ? 'Remove or bake the crop first' : undefined}
          >
            Set Resolution
          </button>
        )
      })()}
      <button
        onClick={handleResetTransform}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Reset Transform
      </button>
      <div style={separatorStyle} />
      <button
        onClick={handleDuplicate}
        style={{
          ...buttonStyle,
          opacity: isOffline ? 0.5 : 1,
          cursor: isOffline ? 'not-allowed' : 'pointer',
        }}
        disabled={isOffline}
        onMouseEnter={(e) => !isOffline && (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        title={isOffline ? 'Duplicate unavailable in offline mode' : undefined}
      >
        Duplicate
      </button>
      {imageItem && isGifSrc(imageItem.src) && (
        <button
          onClick={handleConvertToVideo}
          style={{
            ...buttonStyle,
            opacity: isOffline ? 0.5 : 1,
            cursor: isOffline ? 'not-allowed' : 'pointer',
          }}
          disabled={isOffline}
          onMouseEnter={(e) => !isOffline && (e.currentTarget.style.background = '#4a4a4a')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          title={isOffline ? 'Convert unavailable in offline mode' : undefined}
        >
          Convert to Video
        </button>
      )}
      <div style={separatorStyle} />
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
