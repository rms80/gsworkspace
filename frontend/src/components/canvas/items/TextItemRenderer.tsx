import { useRef } from 'react'
import { Rect, Text, Group } from 'react-konva'
import Konva from 'konva'
import { TextItem } from '../../../types'
import { MIN_TEXT_WIDTH, COLOR_SELECTED } from '../../../constants/canvas'
import { snapToGrid, snapDragPos } from '../../../utils/grid'

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
  const groupRef = useRef<Konva.Group>(null)
  const realRectRef = useRef<Konva.Rect>(null)
  const realTextRef = useRef<Konva.Text>(null)
  const previewGroupRef = useRef<Konva.Group | null>(null)

  const textNode = new Konva.Text({
    text: item.text,
    fontSize: item.fontSize,
    width: item.width,
  })
  const textHeight = textNode.height()

  return (
    <Group
      ref={groupRef}
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      draggable
      dragBoundFunc={(pos) => {
        const stage = groupRef.current?.getStage()
        return stage ? snapDragPos(pos, stage) : pos
      }}
      onClick={(e) => onItemClick(e, item.id)}
      onDblClick={() => onDblClick(item.id)}
      onDragEnd={(e) => {
        onUpdateItem(item.id, { x: snapToGrid(e.target.x()), y: snapToGrid(e.target.y()) })
      }}
      onTransform={(e) => {
        const group = e.target
        const scaleX = group.scaleX()
        const newWidth = Math.max(MIN_TEXT_WIDTH, item.width * scaleX)

        // Hide real children via opacity (not visible, which breaks Transformer)
        if (realRectRef.current) realRectRef.current.opacity(0)
        if (realTextRef.current) realTextRef.current.opacity(0)

        // Create preview group on first transform call
        const layer = group.getLayer()
        if (!previewGroupRef.current && layer) {
          const previewGroup = new Konva.Group({ listening: false })
          const previewRect = new Konva.Rect({
            stroke: isSelected ? '#0066cc' : 'rgba(204, 204, 204, 0.5)',
            strokeWidth: 1,
            cornerRadius: 4,
          })
          const previewText = new Konva.Text({
            x: padding,
            y: padding,
            text: item.text,
            fontSize: item.fontSize,
            fill: '#ddd',
          })
          previewGroup.add(previewRect)
          previewGroup.add(previewText)
          layer.add(previewGroup)
          previewGroupRef.current = previewGroup
        }

        // Update preview position and size
        const preview = previewGroupRef.current
        if (preview) {
          preview.x(group.x())
          preview.y(group.y())
          const previewText = preview.findOne('Text') as Konva.Text
          const previewRect = preview.findOne('Rect') as Konva.Rect
          if (previewText) previewText.width(newWidth)
          if (previewRect) {
            const measurer = new Konva.Text({
              text: item.text,
              fontSize: item.fontSize,
              width: newWidth,
            })
            previewRect.width(newWidth + padding * 2)
            previewRect.height(measurer.height() + padding * 2)
          }
        }
      }}
      onTransformEnd={(e) => {
        const node = e.target
        const scaleX = node.scaleX()
        node.scaleX(1)
        node.scaleY(1)
        const newWidth = Math.max(MIN_TEXT_WIDTH, item.width * scaleX)

        // Remove preview
        if (previewGroupRef.current) {
          previewGroupRef.current.destroy()
          previewGroupRef.current = null
        }

        // Restore real children opacity
        if (realRectRef.current) realRectRef.current.opacity(1)
        if (realTextRef.current) realTextRef.current.opacity(1)

        onUpdateItem(item.id, {
          x: snapToGrid(node.x()),
          y: snapToGrid(node.y()),
          width: newWidth,
        })
      }}
      visible={!isEditing}
    >
      <Rect
        ref={realRectRef}
        width={item.width + padding * 2}
        height={textHeight + padding * 2}
        stroke={isSelected ? COLOR_SELECTED : 'rgba(204, 204, 204, 0.5)'}
        strokeWidth={1}
        cornerRadius={4}
      />
      <Text
        ref={realTextRef}
        x={padding}
        y={padding}
        text={item.text}
        fontSize={item.fontSize}
        width={item.width}
        fill="#ddd"
      />
    </Group>
  )
}
