import { useRef } from 'react'
import { Rect, Text, Group } from 'react-konva'
import Konva from 'konva'
import { EmbedVideoItem } from '../../../types'
import {
  EMBED_VIDEO_HEADER_HEIGHT,
  MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT,
  COLOR_SELECTED, COLOR_BORDER_DEFAULT,
} from '../../../constants/canvas'
import { snapToGrid, snapDragPos } from '../../../utils/grid'

interface EmbedVideoItemRendererProps {
  item: EmbedVideoItem
  isSelected: boolean
  stageScale: number
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<EmbedVideoItem>) => void
  setEmbedVideoItemTransforms: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; width: number; height: number }>>>
}

export default function EmbedVideoItemRenderer({
  item,
  isSelected,
  stageScale,
  onItemClick,
  onUpdateItem,
  setEmbedVideoItemTransforms,
}: EmbedVideoItemRendererProps) {
  const groupRef = useRef<Konva.Group>(null)

  // When zoomed in past 100%, shrink header in canvas space so it stays
  // the same visual size on screen (matching VideoItemRenderer behavior)
  const zoomFactor = Math.max(1, stageScale)
  const effectiveHeaderHeight = EMBED_VIDEO_HEADER_HEIGHT / zoomFactor

  // Header only visible when selected
  const headerHeight = isSelected ? effectiveHeaderHeight : 0

  return (
    <Group
      ref={groupRef}
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y - headerHeight}
      width={item.width}
      height={item.height + headerHeight}
      draggable
      dragBoundFunc={(pos) => {
        const stage = groupRef.current?.getStage()
        return stage ? snapDragPos(pos, stage, headerHeight) : pos
      }}
      onClick={(e) => onItemClick(e, item.id)}
      onDragMove={(e) => {
        const node = e.target
        setEmbedVideoItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(item.id, {
            x: node.x(),
            y: node.y() + headerHeight,
            width: item.width,
            height: item.height,
          })
          return next
        })
      }}
      onDragEnd={(e) => {
        const node = e.target
        onUpdateItem(item.id, { x: node.x(), y: node.y() + headerHeight })
        setEmbedVideoItemTransforms((prev) => {
          const next = new Map(prev)
          next.delete(item.id)
          return next
        })
      }}
      onTransform={(e) => {
        const node = e.target
        const scaleX = node.scaleX()
        setEmbedVideoItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(item.id, {
            x: node.x(),
            y: node.y() + headerHeight,
            width: item.width * scaleX,
            height: item.width * scaleX * (9 / 16),
          })
          return next
        })
      }}
      onTransformEnd={(e) => {
        const node = e.target
        const scaleX = node.scaleX()
        node.scaleX(1)
        node.scaleY(1)
        const newWidth = Math.max(MIN_PROMPT_WIDTH, node.width() * scaleX)
        const newHeight = Math.max(MIN_PROMPT_HEIGHT, newWidth * (9 / 16))
        onUpdateItem(item.id, {
          x: snapToGrid(node.x()),
          y: snapToGrid(node.y() + headerHeight),
          width: newWidth,
          height: newHeight,
        })
        setEmbedVideoItemTransforms((prev) => {
          const next = new Map(prev)
          next.delete(item.id)
          return next
        })
      }}
    >
      {/* Header bar - only visible when selected, inversely scaled at zoom > 1x */}
      {isSelected && (
        <Group scaleX={1 / zoomFactor} scaleY={1 / zoomFactor}>
          <Rect
            width={item.width * zoomFactor}
            height={EMBED_VIDEO_HEADER_HEIGHT}
            fill="#8b1a1a"
            stroke={COLOR_SELECTED}
            strokeWidth={2}
            cornerRadius={[4, 4, 0, 0]}
          />
          <Text
            x={8}
            y={5}
            text={item.label || 'YouTube Video'}
            fontSize={14}
            fontStyle="bold"
            fill="#e0e0e0"
            width={item.width * zoomFactor - 16}
            wrap="none"
            ellipsis={true}
          />
        </Group>
      )}

      {/* Selection border */}
      {isSelected && (
        <Rect
          y={headerHeight}
          width={item.width}
          height={item.height}
          fill="transparent"
          stroke={COLOR_SELECTED}
          strokeWidth={2 / stageScale}
          listening={false}
        />
      )}

      {/* Content area (transparent rect for hit detection) */}
      <Rect
        y={headerHeight}
        width={item.width}
        height={item.height}
        fill="transparent"
        stroke={isSelected ? 'transparent' : COLOR_BORDER_DEFAULT}
        strokeWidth={isSelected ? 0 : 1}
      />
    </Group>
  )
}
