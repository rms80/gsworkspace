import { VideoItem } from '../../../types'
import { Z_MENU } from '../../../constants/canvas'

interface VideoContextMenuProps {
  position: { x: number; y: number }
  videoItem: VideoItem | undefined
  isOffline: boolean
  onUpdateItem: (id: string, changes: Partial<VideoItem>) => void
  onCrop: (videoId: string) => void
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
  isOffline,
  onUpdateItem,
  onCrop,
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

  const handleCrop = () => {
    if (!videoItem) { onClose(); return }
    onCrop(videoItem.id)
    onClose()
  }

  const handleRemoveCrop = () => {
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

    onUpdateItem(videoItem.id, {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      cropRect: undefined,
      cropSrc: undefined,
      speedFactor: undefined,
    })
    onClose()
  }

  const handleExport = async () => {
    if (!videoItem) { onClose(); return }

    try {
      // Use cropped version if available, otherwise original
      const exportSrc = videoItem.cropSrc ?? videoItem.src
      const ext = videoItem.cropSrc ? 'mp4' : getVideoExtension(videoItem.src)
      const baseName = videoItem.name || 'video'
      const filename = `${baseName}.${ext}`

      let blob: Blob

      if (exportSrc.startsWith('data:') || exportSrc.startsWith('blob:')) {
        // Fetch directly for data URLs and blob URLs
        const response = await fetch(exportSrc)
        blob = await response.blob()
      } else {
        // Use proxy for external URLs to avoid CORS
        const proxyUrl = `/api/proxy-video?url=${encodeURIComponent(exportSrc)}`
        const response = await fetch(proxyUrl)
        if (!response.ok) {
          // Try direct fetch as fallback
          const directResponse = await fetch(exportSrc)
          if (!directResponse.ok) {
            throw new Error('Failed to fetch video')
          }
          blob = await directResponse.blob()
        } else {
          blob = await response.blob()
        }
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
      {(videoItem?.cropRect || videoItem?.speedFactor) && (
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
