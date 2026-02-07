import { ImageItem } from '../../../types'

interface GifOverlayProps {
  item: ImageItem
  stageScale: number
  stagePos: { x: number; y: number }
  isSelected: boolean
  transform?: { x: number; y: number; width: number; height: number }
}

/**
 * DOM <img> overlay for animated GIF images.
 * Positioned over the Konva canvas, tracking the item's position live
 * during drag/transform via the transform prop.
 */
export default function GifOverlay({
  item,
  stageScale,
  stagePos,
  isSelected: _isSelected,
  transform,
}: GifOverlayProps) {
  const scaleX = item.scaleX ?? 1
  const scaleY = item.scaleY ?? 1
  const x = transform?.x ?? item.x
  const y = transform?.y ?? item.y
  const width = transform?.width ?? item.width * scaleX
  const height = transform?.height ?? item.height * scaleY

  const displayWidth = width * stageScale
  const displayHeight = height * stageScale

  const left = x * stageScale + stagePos.x
  const top = y * stageScale + stagePos.y

  // Use cropSrc if available (server-side cropped GIF), otherwise original
  const imgSrc = item.cropSrc ?? item.src

  // Calculate CSS crop styling when we have cropRect but no cropSrc
  const hasCropRect = item.cropRect && !item.cropSrc
  let imgStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: 'fill',
    pointerEvents: 'none',
    display: 'block',
  }

  if (hasCropRect && item.cropRect) {
    const origWidth = item.originalWidth ?? (item.cropRect.x + item.cropRect.width)
    const origHeight = item.originalHeight ?? (item.cropRect.y + item.cropRect.height)

    const cropScaleX = width / item.cropRect.width
    const cropScaleY = height / item.cropRect.height

    imgStyle = {
      ...imgStyle,
      width: origWidth * scaleX,
      height: origHeight * scaleY,
      objectFit: 'fill',
      position: 'absolute',
      left: -(item.cropRect.x * cropScaleX),
      top: -(item.cropRect.y * cropScaleY),
      transform: `scale(${cropScaleX / scaleX}, ${cropScaleY / scaleY})`,
      transformOrigin: 'top left',
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width: displayWidth,
        height: displayHeight,
        overflow: hasCropRect ? 'hidden' : undefined,
        pointerEvents: 'none',
      }}
    >
      <img
        src={imgSrc}
        style={imgStyle}
      />
    </div>
  )
}
