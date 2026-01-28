import { Rect, Text, Group } from 'react-konva'
import Konva from 'konva'
import { TextItem } from '../../../types'
import { MIN_TEXT_WIDTH, COLOR_SELECTED, COLOR_BORDER_DEFAULT } from '../../../constants/canvas'

interface TextItemRendererProps {
  item: TextItem
  isSelected: boolean
  isEditing: boolean
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onDblClick: (id: string) => void
  onUpdateItem: (id: string, changes: Partial<TextItem>) => void
}

export default function TextItemRenderer({
  item,
  isSelected,
  isEditing,
  onItemClick,
  onDblClick,
  onUpdateItem,
}: TextItemRendererProps) {
  const padding = 8
  const textNode = new Konva.Text({
    text: item.text,
    fontSize: item.fontSize,
    width: item.width,
  })
  const textHeight = textNode.height()

  return (
    <Group
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      draggable
      onClick={(e) => onItemClick(e, item.id)}
      onDblClick={() => onDblClick(item.id)}
      onDragEnd={(e) => {
        onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
      }}
      onTransformEnd={(e) => {
        const node = e.target
        const scaleX = node.scaleX()
        node.scaleX(1)
        node.scaleY(1)
        const newWidth = Math.max(MIN_TEXT_WIDTH, item.width * scaleX)
        onUpdateItem(item.id, {
          x: node.x(),
          y: node.y(),
          width: newWidth,
        })
      }}
      visible={!isEditing}
    >
      <Rect
        width={item.width + padding * 2}
        height={textHeight + padding * 2}
        stroke={isSelected ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
        strokeWidth={1}
        cornerRadius={4}
      />
      <Text
        x={padding}
        y={padding}
        text={item.text}
        fontSize={item.fontSize}
        width={item.width}
        fill={isSelected ? COLOR_SELECTED : '#000'}
      />
    </Group>
  )
}
