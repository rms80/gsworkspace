import { Rect } from 'react-konva'
import Konva from 'konva'
import { VideoItem } from '../../../types'
import { COLOR_SELECTED, COLOR_BORDER_DEFAULT } from '../../../constants/canvas'

interface VideoItemRendererProps {
  item: VideoItem
  isSelected: boolean
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<VideoItem>) => void
  setVideoItemTransforms: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; width: number; height: number }>>>
}

/**
 * Renders a placeholder rectangle for a video item on the Konva canvas.
 * The actual video is rendered as an HTML overlay (see VideoOverlay component).
 */
export default function VideoItemRenderer({
  item,
  isSelected,
  onItemClick,
  onUpdateItem,
  setVideoItemTransforms,
}: VideoItemRendererProps) {
  const scaleX = item.scaleX ?? 1
  const scaleY = item.scaleY ?? 1
  const displayWidth = item.width * scaleX
  const displayHeight = item.height * scaleY

  return (
    <Rect
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      width={displayWidth}
      height={displayHeight}
      scaleX={1}
      scaleY={1}
      fill="#1a1a2e"
      stroke={isSelected ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
      strokeWidth={isSelected ? 2 : 1}
      cornerRadius={4}
      draggable
      onClick={(e) => onItemClick(e, item.id)}
      onDragStart={() => {
        setVideoItemTransforms((prev) => {
          const newMap = new Map(prev)
          newMap.set(item.id, { x: item.x, y: item.y, width: displayWidth, height: displayHeight })
          return newMap
        })
      }}
      onDragMove={(e) => {
        setVideoItemTransforms((prev) => {
          const newMap = new Map(prev)
          newMap.set(item.id, { x: e.target.x(), y: e.target.y(), width: displayWidth, height: displayHeight })
          return newMap
        })
      }}
      onDragEnd={(e) => {
        setVideoItemTransforms((prev) => {
          const newMap = new Map(prev)
          newMap.delete(item.id)
          return newMap
        })
        onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
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
          y: node.y(),
          scaleX: newScaleX,
          scaleY: newScaleY,
          rotation: node.rotation(),
        })
      }}
    />
  )
}
