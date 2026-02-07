import { Image as KonvaImage, Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import { ImageItem } from '../../../types'
import { IMAGE_HEADER_HEIGHT, COLOR_SELECTED } from '../../../constants/canvas'

interface ImageItemRendererProps {
  item: ImageItem
  image: HTMLImageElement
  isSelected: boolean
  isGif: boolean
  editingImageLabelId: string | null
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<ImageItem>) => void
  onLabelDblClick: (id: string) => void
  setGifItemTransforms?: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; width: number; height: number }>>>
}

/**
 * Format file size in bytes to human-readable string
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export default function ImageItemRenderer({
  item,
  image,
  isSelected,
  isGif,
  editingImageLabelId,
  onItemClick,
  onContextMenu,
  onUpdateItem,
  onLabelDblClick,
  setGifItemTransforms,
}: ImageItemRendererProps) {
  const scaleX = item.scaleX ?? 1
  const scaleY = item.scaleY ?? 1
  const displayWidth = item.width * scaleX
  const displayHeight = item.height * scaleY

  // Header is only visible when selected
  const headerHeight = isSelected ? IMAGE_HEADER_HEIGHT : 0

  // Build metadata string (dimensions and file size)
  // Show cropped dimensions if crop exists, otherwise original dimensions
  const metadataParts: string[] = []
  if (item.cropRect) {
    metadataParts.push(`${Math.round(item.cropRect.width)}×${Math.round(item.cropRect.height)}`)
  } else if (item.originalWidth && item.originalHeight) {
    metadataParts.push(`${Math.round(item.originalWidth)}×${Math.round(item.originalHeight)}`)
  }
  if (item.fileSize) {
    metadataParts.push(formatFileSize(item.fileSize))
  }
  const metadataText = metadataParts.join(' • ')

  return (
    <Group
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y - headerHeight}
      draggable
      onClick={(e) => onItemClick(e, item.id)}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        e.cancelBubble = true
        onContextMenu(e, item.id)
      }}
      onDragStart={() => {
        if (isGif && setGifItemTransforms) {
          setGifItemTransforms((prev) => {
            const newMap = new Map(prev)
            newMap.set(item.id, { x: item.x, y: item.y, width: displayWidth, height: displayHeight })
            return newMap
          })
        }
      }}
      onDragMove={(e) => {
        if (isGif && setGifItemTransforms) {
          const node = e.target
          setGifItemTransforms((prev) => {
            const newMap = new Map(prev)
            newMap.set(item.id, {
              x: node.x(),
              y: node.y() + headerHeight,
              width: displayWidth,
              height: displayHeight,
            })
            return newMap
          })
        }
      }}
      onDragEnd={(e) => {
        const node = e.target
        if (isGif && setGifItemTransforms) {
          setGifItemTransforms((prev) => {
            const newMap = new Map(prev)
            newMap.delete(item.id)
            return newMap
          })
        }
        // Save position adjusted for header
        onUpdateItem(item.id, { x: node.x(), y: node.y() + headerHeight })
      }}
      onTransformEnd={(e) => {
        const node = e.target
        // Capture the transform scale before resetting
        const newScaleX = (item.scaleX ?? 1) * node.scaleX()
        const newScaleY = (item.scaleY ?? 1) * node.scaleY()
        // Reset node scale since we bake it into item.scaleX/Y
        node.scaleX(1)
        node.scaleY(1)
        onUpdateItem(item.id, {
          x: node.x(),
          y: node.y() + headerHeight,
          scaleX: newScaleX,
          scaleY: newScaleY,
          rotation: node.rotation(),
        })
      }}
    >
      {/* Header bar - only visible when selected */}
      {isSelected && (
        <>
          <Rect
            width={displayWidth}
            height={IMAGE_HEADER_HEIGHT}
            fill="#2a2a4e"
            stroke={COLOR_SELECTED}
            strokeWidth={2}
            cornerRadius={[4, 4, 0, 0]}
          />
          {/* Label text (left-aligned) */}
          <Text
            x={8}
            y={4}
            text={item.name || 'Image'}
            fontSize={14}
            fontStyle="bold"
            fill="#e0e0e0"
            width={displayWidth - 16 - (metadataText ? 150 : 0)}
            ellipsis={true}
            onDblClick={() => onLabelDblClick(item.id)}
            visible={editingImageLabelId !== item.id}
          />
          {/* Metadata text (right-aligned) */}
          {metadataText && (
            <Text
              x={displayWidth - 158}
              y={5}
              text={metadataText}
              fontSize={11}
              fill="#a0a0a0"
              align="right"
              width={150}
              listening={false}
            />
          )}
        </>
      )}

      {/* Image content: GIFs use transparent rect (overlay handles display), others use Konva Image */}
      {isGif ? (
        <Rect
          y={headerHeight}
          width={displayWidth}
          height={displayHeight}
          fill="transparent"
          stroke={isSelected ? COLOR_SELECTED : 'transparent'}
          strokeWidth={isSelected ? 2 : 0}
        />
      ) : (
        <KonvaImage
          y={headerHeight}
          image={image}
          width={item.width}
          height={item.height}
          crop={item.cropRect ? { x: item.cropRect.x, y: item.cropRect.y, width: item.cropRect.width, height: item.cropRect.height } : undefined}
          scaleX={scaleX}
          scaleY={scaleY}
          rotation={item.rotation ?? 0}
          stroke={isSelected ? COLOR_SELECTED : undefined}
          strokeWidth={isSelected ? 2 : 0}
        />
      )}
    </Group>
  )
}
