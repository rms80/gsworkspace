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

/**
 * Gets the file extension from an image src URL
 */
function getImageExtension(src: string): string {
  // Try to get from data URL
  if (src.startsWith('data:image/')) {
    const match = src.match(/data:image\/(\w+)/)
    if (match) {
      return match[1] === 'jpeg' ? 'jpg' : match[1]
    }
  }
  // Try to get from URL path
  if (src.includes('.')) {
    const match = src.match(/\.(\w+)(?:\?|$)/)
    if (match && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(match[1].toLowerCase())) {
      return match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase()
    }
  }
  // Default to png
  return 'png'
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

  const handleExport = async () => {
    if (!imageItem) { onClose(); return }

    try {
      // Use cropped version if available, otherwise original
      const srcToExport = imageItem.cropSrc || imageItem.src
      const ext = getImageExtension(srcToExport)
      // Use image label for filename, falling back to 'image'
      const baseName = imageItem.name || 'image'
      const filename = `${baseName}.${ext}`

      let blob: Blob

      if (srcToExport.startsWith('data:')) {
        // Convert data URL to blob
        const response = await fetch(srcToExport)
        blob = await response.blob()
      } else if (srcToExport.startsWith('blob:')) {
        const response = await fetch(srcToExport)
        blob = await response.blob()
      } else {
        // Use proxy for external URLs to avoid CORS
        const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(srcToExport)}`
        const response = await fetch(proxyUrl)
        if (!response.ok) {
          // Try direct fetch as fallback
          const directResponse = await fetch(srcToExport)
          if (!directResponse.ok) {
            throw new Error('Failed to fetch image')
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
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            bmp: 'image/bmp',
            svg: 'image/svg+xml',
          }
          const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle> }).showSaveFilePicker({
            suggestedName: filename,
            types: [{
              description: 'Image file',
              accept: { [mimeTypes[ext] || 'image/png']: [`.${ext}`] },
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
      console.error('Failed to export image:', error)
      alert('Failed to export image. Please try again.')
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
