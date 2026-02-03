import { Image as KonvaImage, Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import { ImageItem, CropRect } from '../../../types'
import ImageCropOverlay from '../../ImageCropOverlay'
import { IMAGE_HEADER_HEIGHT, COLOR_SELECTED } from '../../../constants/canvas'

interface ImageItemRendererProps {
  item: ImageItem
  image: HTMLImageElement
  isSelected: boolean
  isCropping: boolean
  pendingCropRect: CropRect | null
  stageScale: number
  editingImageLabelId: string | null
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<ImageItem>) => void
  onCropChange: (rect: CropRect) => void
  onLabelDblClick: (id: string) => void
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
  isCropping,
  pendingCropRect,
  stageScale,
  editingImageLabelId,
  onItemClick,
  onContextMenu,
  onUpdateItem,
  onCropChange,
  onLabelDblClick,
}: ImageItemRendererProps) {
  if (isCropping && pendingCropRect) {
    return (
      <ImageCropOverlay
        key={`crop-${item.id}`}
        item={item}
        image={image}
        cropRect={pendingCropRect}
        stageScale={stageScale}
        onCropChange={onCropChange}
      />
    )
  }

  const scaleX = item.scaleX ?? 1
  const scaleY = item.scaleY ?? 1
  const displayWidth = item.width * scaleX

  // Header is only visible when selected
  const headerHeight = isSelected ? IMAGE_HEADER_HEIGHT : 0

  // Build metadata string (dimensions and file size)
  // Show cropped dimensions if crop exists, otherwise original dimensions
  const metadataParts: string[] = []
  if (item.cropRect) {
    metadataParts.push(`${Math.round(item.cropRect.width)}×${Math.round(item.cropRect.height)}`)
  } else if (item.originalWidth && item.originalHeight) {
    metadataParts.push(`${item.originalWidth}×${item.originalHeight}`)
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
      onDragEnd={(e) => {
        const node = e.target
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

      {/* Image content */}
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
    </Group>
  )
}
