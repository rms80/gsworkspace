import { VideoItem } from '../../../types'
import { Z_MENU } from '../../../constants/canvas'
import { getContentUrl, getContentData } from '../../../api/scenes'

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

/**
 * Gets the file extension from a video src URL
 */
function getVideoExtension(src: string): string {
  // Try to get from URL path
  if (src.includes('.')) {
    const match = src.match(/\.(\w+)(?:\?|$)/)
    if (match && ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'].includes(match[1].toLowerCase())) {
      return match[1].toLowerCase()
    }
  }
  // Try to get from data URL
  if (src.startsWith('data:video/')) {
    const match = src.match(/data:video\/(\w+)/)
    if (match) {
      return match[1]
    }
  }
  // Default to mp4
  return 'mp4'
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
    padding: '8px 16px',
    border: 'none',
    background: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: 14,
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
      speedFactor: undefined,
      removeAudio: undefined,
    })
    onClose()
  }

  const handleExport = async () => {
    if (!videoItem) { onClose(); return }

    try {
      // Use cropped version if available, otherwise original
      const hasEdits = !!(videoItem.cropSrc || videoItem.cropRect || videoItem.speedFactor || videoItem.removeAudio || videoItem.trim)
      const ext = hasEdits ? 'mp4' : getVideoExtension(videoItem.src)
      const baseName = videoItem.name || 'video'
      const filename = `${baseName}.${ext}`

      let blob: Blob

      const exportSrc = videoItem.cropSrc ?? videoItem.src
      if (exportSrc.startsWith('data:') || exportSrc.startsWith('blob:')) {
        // Fetch directly for data URLs and blob URLs
        const response = await fetch(exportSrc)
        blob = await response.blob()
      } else {
        // Use getContentData API for S3 URLs
        blob = await getContentData(sceneId, videoItem.id, 'video', hasEdits)
      }

      // Try to use File System Access API for native save dialog
      if ('showSaveFilePicker' in window) {
        try {
          const mimeTypes: Record<string, string> = {
            mp4: 'video/mp4',
            webm: 'video/webm',
            ogg: 'video/ogg',
            mov: 'video/quicktime',
            avi: 'video/x-msvideo',
            mkv: 'video/x-matroska',
          }
          const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Video file',
              accept: { [mimeTypes[ext] || 'video/mp4']: [`.${ext}`] },
            }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          onClose()
          return
        } catch (err) {
          // User cancelled or API failed, fall through to download
          if ((err as Error).name === 'AbortError') {
            onClose()
            return
          }
        }
      }

      // Fallback: Create download link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export video:', error)
      alert('Failed to export video. Please try again.')
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
        onClick={handleCrop}
        style={{
          ...buttonStyle,
          opacity: isOffline ? 0.5 : 1,
          cursor: isOffline ? 'not-allowed' : 'pointer',
        }}
        disabled={isOffline}
        onMouseEnter={(e) => !isOffline && (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        title={isOffline ? 'Edit unavailable in offline mode' : undefined}
      >
        Edit
      </button>
      {(videoItem?.cropRect || videoItem?.speedFactor || videoItem?.removeAudio) && (
        <button
          onClick={handleRemoveCrop}
          style={buttonStyle}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          Remove Edits
        </button>
      )}
      <button
        onClick={handleDuplicate}
        style={{
          ...buttonStyle,
          opacity: isOffline ? 0.5 : 1,
          cursor: isOffline ? 'not-allowed' : 'pointer',
        }}
        disabled={isOffline}
        onMouseEnter={(e) => !isOffline && (e.currentTarget.style.background = '#f0f0f0')}
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
        onMouseEnter={(e) => !isOffline && (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        title={isOffline ? 'Convert unavailable in offline mode' : undefined}
      >
        Convert to GIF
      </button>
      <button
        onClick={handleExport}
        style={buttonStyle}
        onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
      >
        Export
      </button>
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
