import { VideoItem } from '../../../types'
import { Z_MENU } from '../../../constants/canvas'
import { getContentUrl } from '../../../api/scenes'
import { downloadVideo, exportVideo, getVideoExtension } from '../../../utils/downloadItem'

interface VideoContextMenuProps {
  position: { x: number; y: number }
  videoItem: VideoItem | undefined
  sceneId: string
  isOffline: boolean
  onUpdateItem: (id: string, changes: Partial<VideoItem>) => void
  onCrop: (videoId: string) => void
  onDuplicate: (videoItem: VideoItem) => void
  onConvertToGif: (videoItem: VideoItem) => void
  onClose: () => void
}

export default function VideoContextMenu({
  position,
  videoItem,
  sceneId,
  isOffline,
  onUpdateItem,
  onCrop,
  onDuplicate,
  onConvertToGif,
  onClose,
}: VideoContextMenuProps) {
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
    if (!videoItem) { onClose(); return }
    onDuplicate(videoItem)
    onClose()
  }

  const handleConvertToGif = () => {
    if (!videoItem) { onClose(); return }
    onConvertToGif(videoItem)
    onClose()
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

  const handleCrop = () => {
    if (!videoItem) { onClose(); return }
    onCrop(videoItem.id)
    onClose()
  }

  const handleRemoveCrop = async () => {
    if (!videoItem) { onClose(); return }
    // Calculate scale factor from cropped display size
    const origW = videoItem.originalWidth ?? videoItem.width
    const origH = videoItem.originalHeight ?? videoItem.height
    const cropRect = videoItem.cropRect
    const scaleX = videoItem.scaleX ?? 1
    const scaleY = videoItem.scaleY ?? 1

    let newWidth: number
    let newHeight: number
    let newX = videoItem.x
    let newY = videoItem.y

    if (cropRect) {
      // The cropped region (cropRect.width x cropRect.height source pixels)
      // is displayed at (videoItem.width x videoItem.height) canvas size.
      // Maintain the same scale for the full video.
      const baseDisplayScaleX = videoItem.width / cropRect.width
      const baseDisplayScaleY = videoItem.height / cropRect.height
      const displayScaleX = baseDisplayScaleX * scaleX
      const displayScaleY = baseDisplayScaleY * scaleY
      newWidth = origW * baseDisplayScaleX
      newHeight = origH * baseDisplayScaleY
      // Adjust position so the uncropped video aligns with where crop region was
      newX = videoItem.x - cropRect.x * displayScaleX
      newY = videoItem.y - cropRect.y * displayScaleY
    } else {
      // No crop rect, just use original dimensions
      newWidth = origW
      newHeight = origH
    }

    // Get the permanent URL for the original video (not the temp URL)
    // Use the original video's extension, not hardcoded mp4
    let newSrc = videoItem.src
    if (!isOffline && sceneId) {
      try {
        const ext = getVideoExtension(videoItem.src)
        newSrc = await getContentUrl(sceneId, videoItem.id, 'video', ext, false)
      } catch (err) {
        console.error('Failed to get permanent video URL:', err)
        // Fall back to existing src
      }
    }

    onUpdateItem(videoItem.id, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      src: newSrc,
      cropRect: undefined,
      cropSrc: undefined,
      cropSrcFileSize: undefined,
      speedFactor: undefined,
      removeAudio: undefined,
    })
    onClose()
  }

  const handleExport = async () => {
    if (!videoItem) { onClose(); return }
    try {
      await exportVideo(videoItem, sceneId)
    } catch (error) {
      console.error('Failed to export video:', error)
      alert('Failed to export video. Please try again.')
    }
    onClose()
  }

  const handleDownload = async () => {
    if (!videoItem) { onClose(); return }
    try {
      await downloadVideo(videoItem, sceneId)
    } catch (error) {
      console.error('Failed to download video:', error)
      alert('Failed to download video. Please try again.')
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
        style={{
          ...buttonStyle,
          opacity: isOffline ? 0.5 : 1,
          cursor: isOffline ? 'not-allowed' : 'pointer',
        }}
        disabled={isOffline}
        onMouseEnter={(e) => !isOffline && (e.currentTarget.style.background = '#4a4a4a')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        title={isOffline ? 'Edit unavailable in offline mode' : undefined}
      >
        {(videoItem?.cropRect || videoItem?.speedFactor || videoItem?.removeAudio) ? 'Modify Edits' : 'Edit'}
      </button>
      {(videoItem?.cropRect || videoItem?.speedFactor || videoItem?.removeAudio) && (
        <button
          onClick={handleRemoveCrop}
          style={buttonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#4a4a4a')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          Remove Edits
        </button>
      )}
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
      <button
        onClick={handleConvertToGif}
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
        Convert to GIF
      </button>
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
