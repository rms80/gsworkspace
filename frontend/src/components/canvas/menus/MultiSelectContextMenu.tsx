import { CanvasItem } from '../../../types'
import { Z_MENU } from '../../../constants/canvas'
import { downloadSelectedItems, downloadSelectedItemsAsZip, exportSelectedItemsAsZip, exportSelectedItemsToDirectory } from '../../../utils/downloadItem'

interface MultiSelectContextMenuProps {
  position: { x: number; y: number }
  items: CanvasItem[]
  selectedIds: string[]
  sceneId: string
  onClose: () => void
  onCombineTextItems?: () => void
  /** Called with the selected image ids, in selection order */
  onMultiCrop?: (imageIds: string[]) => void
  /** Called with the selected image ids that have a crop */
  onBakeCrop?: (imageIds: string[]) => void
  /** Called with the selected image ids that have a crop */
  onRemoveCrop?: (imageIds: string[]) => void
  /** Called with the selected image ids */
  onDuplicateImages?: (imageIds: string[]) => void
  isOffline?: boolean
}

export default function MultiSelectContextMenu({
  position,
  items,
  selectedIds,
  sceneId,
  onClose,
  onCombineTextItems,
  onMultiCrop,
  onBakeCrop,
  onRemoveCrop,
  onDuplicateImages,
  isOffline = false,
}: MultiSelectContextMenuProps) {
  const DOWNLOADABLE_TYPES = ['image', 'video', 'text-file', 'pdf']
  const hasDownloadable = selectedIds.some(id => {
    const item = items.find(i => i.id === id)
    return item && DOWNLOADABLE_TYPES.includes(item.type)
  })

  const selectedTextItems = selectedIds.filter(id => {
    const item = items.find(i => i.id === id)
    return item && item.type === 'text'
  })
  const canCombineText = selectedTextItems.length >= 2

  const selectedImageIds = selectedIds.filter(id => items.find(i => i.id === id)?.type === 'image')
  const canMultiCrop = !!onMultiCrop && selectedImageIds.length >= 2

  const croppedImageIds = selectedImageIds.filter(id => {
    const item = items.find(i => i.id === id)
    return item?.type === 'image' && !!item.cropRect
  })
  const canBakeCrop = !!onBakeCrop && croppedImageIds.length > 0
  const canRemoveCrop = !!onRemoveCrop && croppedImageIds.length > 0
  const showDuplicate = !!onDuplicateImages && selectedImageIds.length > 0

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

  const disabledStyle: React.CSSProperties = {
    ...buttonStyle,
    opacity: 0.4,
    cursor: 'default',
  }

  const handleDownloadAll = async () => {
    try {
      await downloadSelectedItems(items, selectedIds, sceneId)
    } catch (error) {
      console.error('Failed to download items:', error)
    }
    onClose()
  }

  const handleDownloadAllZip = async () => {
    try {
      await downloadSelectedItemsAsZip(items, selectedIds, sceneId)
    } catch (error) {
      console.error('Failed to download items as zip:', error)
    }
    onClose()
  }

  const handleExportAll = async () => {
    try {
      await exportSelectedItemsToDirectory(items, selectedIds, sceneId)
    } catch (error) {
      console.error('Failed to export items:', error)
    }
    onClose()
  }

  const handleExportAllZip = async () => {
    try {
      await exportSelectedItemsAsZip(items, selectedIds, sceneId)
    } catch (error) {
      console.error('Failed to export items as zip:', error)
    }
    onClose()
  }

  const handleCombineText = () => {
    onCombineTextItems?.()
    onClose()
  }

  const handleMultiCrop = () => {
    onMultiCrop?.(selectedImageIds)
    onClose()
  }

  const handleBakeCrop = () => {
    onBakeCrop?.(croppedImageIds)
    onClose()
  }

  const handleRemoveCrop = () => {
    onRemoveCrop?.(croppedImageIds)
    onClose()
  }

  const handleDuplicate = () => {
    onDuplicateImages?.(selectedImageIds)
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
      {canCombineText && (
        <>
          <button
            onClick={handleCombineText}
            style={buttonStyle}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            Combine
          </button>
          <div style={{ height: 1, background: '#555', margin: '4px 8px' }} />
        </>
      )}
      {(canMultiCrop || canBakeCrop || canRemoveCrop) && (
        <>
          {canMultiCrop && (
            <button
              onClick={handleMultiCrop}
              style={buttonStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              MultiCrop
            </button>
          )}
          {canRemoveCrop && (
            <button
              onClick={handleRemoveCrop}
              style={buttonStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              Remove Crop
            </button>
          )}
          {canBakeCrop && (
            <button
              onClick={handleBakeCrop}
              style={buttonStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              Bake Crop
            </button>
          )}
          <div style={{ height: 1, background: '#555', margin: '4px 8px' }} />
        </>
      )}
      {showDuplicate && (
        <>
          <button
            onClick={isOffline ? undefined : handleDuplicate}
            disabled={isOffline}
            style={isOffline ? disabledStyle : buttonStyle}
            onMouseEnter={(e) => !isOffline && (e.currentTarget.style.background = '#4a4a4a')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            title={isOffline ? 'Duplicate unavailable in offline mode' : undefined}
          >
            {selectedImageIds.length === selectedIds.length ? 'Duplicate' : 'Duplicate Images'}
          </button>
          <div style={{ height: 1, background: '#555', margin: '4px 8px' }} />
        </>
      )}
      <button
        onClick={hasDownloadable ? handleDownloadAll : undefined}
        disabled={!hasDownloadable}
        style={hasDownloadable ? buttonStyle : disabledStyle}
        onMouseEnter={(e) => hasDownloadable && (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Download All
      </button>
      <button
        onClick={hasDownloadable ? handleDownloadAllZip : undefined}
        disabled={!hasDownloadable}
        style={hasDownloadable ? buttonStyle : disabledStyle}
        onMouseEnter={(e) => hasDownloadable && (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Download All (zip)
      </button>
      <div style={{ height: 1, background: '#555', margin: '4px 8px' }} />
      <button
        onClick={hasDownloadable ? handleExportAll : undefined}
        disabled={!hasDownloadable}
        style={hasDownloadable ? buttonStyle : disabledStyle}
        onMouseEnter={(e) => hasDownloadable && (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Export All
      </button>
      <button
        onClick={hasDownloadable ? handleExportAllZip : undefined}
        disabled={!hasDownloadable}
        style={hasDownloadable ? buttonStyle : disabledStyle}
        onMouseEnter={(e) => hasDownloadable && (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Export All (zip)
      </button>
    </div>
  )
}
