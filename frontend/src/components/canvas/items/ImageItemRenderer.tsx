import { Image as KonvaImage, Group, Rect, Text } from 'react-konva'
import Konva from 'konva'
import { ImageItem } from '../../../types'
import { IMAGE_HEADER_HEIGHT, COLOR_SELECTED } from '../../../constants/canvas'
import { snapToGrid } from '../../../utils/grid'

interface ImageItemRendererProps {
  item: ImageItem
  image: HTMLImageElement
  isSelected: boolean
  isGif: boolean
  editingImageLabelId: string | null
  stageScale: number
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
  stageScale,
}: ImageItemRendererProps) {
  const scaleX = item.scaleX ?? 1
  const scaleY = item.scaleY ?? 1
  const displayWidth = item.width * scaleX
  const displayHeight = item.height * scaleY

  // When zoomed in past 100%, shrink the header in canvas space so it stays
  // the same visual size on screen. When zoomed out, it scales normally.
  const zoomFactor = Math.max(1, stageScale)
  const effectiveHeaderHeight = IMAGE_HEADER_HEIGHT / zoomFactor

  // Header is only visible when selected
  const headerHeight = isSelected ? effectiveHeaderHeight : 0

  // Build metadata string (dimensions and file size)
  // Show cropped dimensions if crop exists, otherwise original dimensions
  const metadataParts: string[] = []
  if (item.cropRect) {
    metadataParts.push(`${Math.round(item.cropRect.width)}×${Math.round(item.cropRect.height)}`)
  } else if (item.originalWidth && item.originalHeight) {
    metadataParts.push(`${Math.round(item.originalWidth)}×${Math.round(item.originalHeight)}`)
  }
  const displayFileSize = item.cropSrcFileSize ?? item.fileSize
  if (displayFileSize) {
    metadataParts.push(formatFileSize(displayFileSize))
  }
  const metadataText = metadataParts.join(' • ')

  return (
    <Group
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y - headerHeight}
      draggable
      dragBoundFunc={(pos) => ({ x: snapToGrid(pos.x), y: snapToGrid(pos.y + headerHeight) - headerHeight })}
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
    >
      {/* Header bar - only visible when selected. Scaled inversely when zoomed
           in so it stays a constant visual size on screen. */}
      {isSelected && (
        <Group scaleX={1 / zoomFactor} scaleY={1 / zoomFactor}>
          <Rect
            width={displayWidth * zoomFactor}
            height={IMAGE_HEADER_HEIGHT}
            fill="#2a2a4e"
            stroke={COLOR_SELECTED}
            strokeWidth={2}
            cornerRadius={[4, 4, 0, 0]}
          />
          {/* Label text (left-aligned, always has priority) */}
          <Text
            x={8}
            y={4}
            text={item.name || 'Image'}
            fontSize={14}
            fontStyle="bold"
            fill="#e0e0e0"
            width={displayWidth * zoomFactor - 16}
            wrap="none"
            ellipsis={true}
            onDblClick={() => onLabelDblClick(item.id)}
            visible={editingImageLabelId !== item.id}
          />
          {/* Metadata text (right-aligned, hidden when too narrow) */}
          {metadataText && displayWidth * zoomFactor > 200 && (
            <Text
              x={displayWidth * zoomFactor - 158}
              y={5}
              text={metadataText}
              fontSize={11}
              fill="#a0a0a0"
              align="right"
              width={150}
              listening={false}
            />
          )}
        </Group>
      )}

      {/* Selection border - outside transform-target so it doesn't affect transformer bounds */}
      {isSelected && (
        <Rect
          y={headerHeight}
          width={displayWidth}
          height={displayHeight}
          fill="transparent"
          stroke={COLOR_SELECTED}
          strokeWidth={2 / stageScale}
          listening={false}
        />
      )}

      {/* Image content wrapper - transformer targets this group (not the header) */}
      <Group
        name="transform-target"
        y={headerHeight}
        onTransformEnd={(e) => {
          const node = e.target
          const parent = node.parent!
          // Capture the transform scale before resetting
          const newScaleX = (item.scaleX ?? 1) * node.scaleX()
          const newScaleY = (item.scaleY ?? 1) * node.scaleY()
          // Calculate absolute position
          const newX = parent.x() + node.x()
          const newY = parent.y() + node.y()
          // Reset inner node
          node.scaleX(1)
          node.scaleY(1)
          node.x(0)
          node.y(headerHeight)
          // Update outer group to match until React re-renders
          parent.x(newX)
          parent.y(newY - headerHeight)
          onUpdateItem(item.id, {
            x: snapToGrid(newX),
            y: snapToGrid(newY),
            scaleX: newScaleX,
            scaleY: newScaleY,
            rotation: node.rotation(),
          })
        }}
      >
        {isGif ? (
          <Rect
            width={displayWidth}
            height={displayHeight}
            fill="transparent"
          />
        ) : (
          <KonvaImage
            image={image}
            width={item.width}
            height={item.height}
            crop={item.cropRect ? { x: item.cropRect.x, y: item.cropRect.y, width: item.cropRect.width, height: item.cropRect.height } : undefined}
            scaleX={scaleX}
            scaleY={scaleY}
            rotation={item.rotation ?? 0}
          />
        )}
      </Group>
    </Group>
  )
}
