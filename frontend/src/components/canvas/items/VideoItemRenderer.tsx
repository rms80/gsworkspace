import { Rect, Text, Group } from 'react-konva'
import Konva from 'konva'
import { VideoItem } from '../../../types'
import {
  VIDEO_HEADER_HEIGHT,
  COLOR_SELECTED,
} from '../../../constants/canvas'

interface VideoItemRendererProps {
  item: VideoItem
  isSelected: boolean
  editingVideoLabelId: string | null
  stageScale: number
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onContextMenu: (e: Konva.KonvaEventObject<PointerEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<VideoItem>) => void
  onLabelDblClick: (id: string) => void
  setVideoItemTransforms: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; width: number; height: number }>>>
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

/**
 * Renders a placeholder rectangle for a video item on the Konva canvas.
 * The actual video is rendered as an HTML overlay (see VideoOverlay component).
 * When selected, shows a header bar with an editable name label.
 */
export default function VideoItemRenderer({
  item,
  isSelected,
  editingVideoLabelId,
  stageScale,
  onItemClick,
  onContextMenu,
  onUpdateItem,
  onLabelDblClick,
  setVideoItemTransforms,
}: VideoItemRendererProps) {
  const scaleX = item.scaleX ?? 1
  const scaleY = item.scaleY ?? 1
  const displayWidth = item.width * scaleX
  const displayHeight = item.height * scaleY

  // When zoomed in past 100%, shrink the header in canvas space so it stays
  // the same visual size on screen. When zoomed out, it scales normally.
  const zoomFactor = Math.max(1, stageScale)
  const effectiveHeaderHeight = VIDEO_HEADER_HEIGHT / zoomFactor

  // Header is only visible when selected
  const headerHeight = isSelected ? effectiveHeaderHeight : 0
  const totalHeight = displayHeight + headerHeight

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
      width={displayWidth}
      height={totalHeight}
      draggable
      onClick={(e) => onItemClick(e, item.id)}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        e.cancelBubble = true
        onContextMenu(e, item.id)
      }}
      onDragStart={() => {
        setVideoItemTransforms((prev) => {
          const newMap = new Map(prev)
          newMap.set(item.id, { x: item.x, y: item.y, width: displayWidth, height: displayHeight })
          return newMap
        })
      }}
      onDragMove={(e) => {
        const node = e.target
        setVideoItemTransforms((prev) => {
          const newMap = new Map(prev)
          // Adjust for header offset: the actual video y is node.y() + headerHeight
          newMap.set(item.id, {
            x: node.x(),
            y: node.y() + headerHeight,
            width: displayWidth,
            height: displayHeight,
          })
          return newMap
        })
      }}
      onDragEnd={(e) => {
        const node = e.target
        setVideoItemTransforms((prev) => {
          const newMap = new Map(prev)
          newMap.delete(item.id)
          return newMap
        })
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
            height={VIDEO_HEADER_HEIGHT}
            fill="#2a2a4e"
            stroke={COLOR_SELECTED}
            strokeWidth={2}
            cornerRadius={[4, 4, 0, 0]}
          />
          {/* Label text (left-aligned, always has priority) */}
          <Text
            x={8}
            y={4}
            text={item.name || 'Video'}
            fontSize={14}
            fontStyle="bold"
            fill="#e0e0e0"
            width={displayWidth * zoomFactor - 16}
            wrap="none"
            ellipsis={true}
            onDblClick={() => onLabelDblClick(item.id)}
            visible={editingVideoLabelId !== item.id}
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

      {/* Video content wrapper - transformer targets this group (not the header) */}
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
            x: newX,
            y: newY,
            scaleX: newScaleX,
            scaleY: newScaleY,
            rotation: node.rotation(),
          })
        }}
      >
        <Rect
          width={displayWidth}
          height={displayHeight}
          fill="transparent"
        />
      </Group>
    </Group>
  )
}
