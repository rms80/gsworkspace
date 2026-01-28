import { Rect, Text, Group } from 'react-konva'
import Konva from 'konva'
import { HtmlItem } from '../../../types'
import { config } from '../../../config'
import {
  HTML_HEADER_HEIGHT, EXPORT_BUTTON_WIDTH, ZOOM_BUTTON_WIDTH,
  MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT,
  ZOOM_STEP, ZOOM_MIN, ZOOM_MAX,
  COLOR_SELECTED, COLOR_BORDER_DEFAULT,
} from '../../../constants/canvas'
import { MenuState } from '../../../hooks/useMenuState'

interface HtmlItemRendererProps {
  item: HtmlItem
  isSelected: boolean
  editingHtmlLabelId: string | null
  exportMenu: MenuState<string>
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<HtmlItem>) => void
  onLabelDblClick: (id: string) => void
  setHtmlItemTransforms: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; width: number; height: number }>>>
  setIsViewportTransforming: (v: boolean) => void
}

export default function HtmlItemRenderer({
  item,
  isSelected,
  editingHtmlLabelId,
  exportMenu,
  onItemClick,
  onUpdateItem,
  onLabelDblClick,
  setHtmlItemTransforms,
  setIsViewportTransforming,
}: HtmlItemRendererProps) {
  const zoom = item.zoom ?? 1

  return (
    <Group
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height + HTML_HEADER_HEIGHT}
      draggable
      onClick={(e) => onItemClick(e, item.id)}
      onDragStart={() => {
        if (config.features.hideHtmlDuringTransform) {
          setIsViewportTransforming(true)
        }
      }}
      onDragMove={(e) => {
        const node = e.target
        setHtmlItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(item.id, {
            x: node.x(),
            y: node.y(),
            width: item.width,
            height: item.height,
          })
          return next
        })
      }}
      onDragEnd={(e) => {
        onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
        setHtmlItemTransforms((prev) => {
          const next = new Map(prev)
          next.delete(item.id)
          return next
        })
        if (config.features.hideHtmlDuringTransform) {
          setIsViewportTransforming(false)
        }
      }}
      onTransformStart={() => {
        if (config.features.hideHtmlDuringTransform) {
          setIsViewportTransforming(true)
        }
      }}
      onTransform={(e) => {
        const node = e.target
        const scaleX = node.scaleX()
        const scaleY = node.scaleY()
        setHtmlItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(item.id, {
            x: node.x(),
            y: node.y(),
            width: item.width * scaleX,
            height: (item.height + HTML_HEADER_HEIGHT) * scaleY - HTML_HEADER_HEIGHT,
          })
          return next
        })
      }}
      onTransformEnd={(e) => {
        const node = e.target
        const scaleX = node.scaleX()
        const scaleY = node.scaleY()
        node.scaleX(1)
        node.scaleY(1)
        onUpdateItem(item.id, {
          x: node.x(),
          y: node.y(),
          width: Math.max(MIN_PROMPT_WIDTH, node.width() * scaleX),
          height: Math.max(MIN_PROMPT_HEIGHT, (node.height() - HTML_HEADER_HEIGHT) * scaleY),
        })
        setHtmlItemTransforms((prev) => {
          const next = new Map(prev)
          next.delete(item.id)
          return next
        })
        if (config.features.hideHtmlDuringTransform) {
          setIsViewportTransforming(false)
        }
      }}
    >
      {/* Header bar for dragging */}
      <Rect
        width={item.width}
        height={HTML_HEADER_HEIGHT}
        fill="#d0d0d0"
        stroke={isSelected ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={[4, 4, 0, 0]}
      />
      {/* Label text */}
      <Text
        x={8}
        y={4}
        text={item.label || 'HTML'}
        fontSize={14}
        fontStyle="bold"
        fill="#333"
        width={item.width - ZOOM_BUTTON_WIDTH * 3 - EXPORT_BUTTON_WIDTH - 24}
        ellipsis={true}
        onDblClick={() => onLabelDblClick(item.id)}
        visible={editingHtmlLabelId !== item.id}
      />
      {/* Export button with dropdown */}
      <Group
        x={item.width - ZOOM_BUTTON_WIDTH * 3 - EXPORT_BUTTON_WIDTH - 12}
        y={2}
        onClick={(e) => {
          e.cancelBubble = true
          if (exportMenu.menuData === item.id) {
            exportMenu.closeMenu()
          } else {
            exportMenu.openMenu(item.id, {
              x: e.evt.clientX - 40,
              y: e.evt.clientY + 10,
            })
          }
        }}
      >
        <Rect
          width={EXPORT_BUTTON_WIDTH}
          height={20}
          fill={exportMenu.menuData === item.id ? '#3d6640' : '#4a7c4e'}
          cornerRadius={3}
        />
        <Text
          text="Export ▾"
          width={EXPORT_BUTTON_WIDTH}
          height={20}
          fontSize={11}
          fill="#fff"
          align="center"
          verticalAlign="middle"
        />
      </Group>
      {/* Zoom out button */}
      <Group
        x={item.width - ZOOM_BUTTON_WIDTH * 3 - 8}
        y={2}
        onClick={(e) => {
          e.cancelBubble = true
          const newZoom = Math.max(ZOOM_MIN, zoom - ZOOM_STEP)
          onUpdateItem(item.id, { zoom: newZoom })
        }}
      >
        <Rect
          width={ZOOM_BUTTON_WIDTH}
          height={20}
          fill="#888"
          cornerRadius={3}
        />
        <Text
          text="-"
          width={ZOOM_BUTTON_WIDTH}
          height={20}
          fontSize={14}
          fontStyle="bold"
          fill="#fff"
          align="center"
          verticalAlign="middle"
        />
      </Group>
      {/* Zoom level display */}
      <Text
        x={item.width - ZOOM_BUTTON_WIDTH * 2 - 6}
        y={2}
        text={`${Math.round(zoom * 100)}%`}
        width={ZOOM_BUTTON_WIDTH}
        height={20}
        fontSize={11}
        fill="#555"
        align="center"
        verticalAlign="middle"
      />
      {/* Zoom in button */}
      <Group
        x={item.width - ZOOM_BUTTON_WIDTH - 4}
        y={2}
        onClick={(e) => {
          e.cancelBubble = true
          const newZoom = Math.min(ZOOM_MAX, zoom + ZOOM_STEP)
          onUpdateItem(item.id, { zoom: newZoom })
        }}
      >
        <Rect
          width={ZOOM_BUTTON_WIDTH}
          height={20}
          fill="#888"
          cornerRadius={3}
        />
        <Text
          text="+"
          width={ZOOM_BUTTON_WIDTH}
          height={20}
          fontSize={14}
          fontStyle="bold"
          fill="#fff"
          align="center"
          verticalAlign="middle"
        />
      </Group>
      {/* Content area background */}
      <Rect
        y={HTML_HEADER_HEIGHT}
        width={item.width}
        height={item.height}
        fill="#fff"
        stroke={isSelected ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={[0, 0, 4, 4]}
      />
    </Group>
  )
}
