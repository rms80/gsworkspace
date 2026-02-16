import { Rect, Text, Group } from 'react-konva'
import Konva from 'konva'
import { CodingRobotItem } from '../../../types'
import {
  CODING_ROBOT_HEADER_HEIGHT,
  MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT,
  COLOR_SELECTED,
  CODING_ROBOT_THEME,
  getPulseColor,
} from '../../../constants/canvas'

interface CodingRobotItemRendererProps {
  item: CodingRobotItem
  isSelected: boolean
  isRunning: boolean
  pulsePhase: number
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<CodingRobotItem>) => void
  setCodingRobotItemTransforms: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; width: number; height: number }>>>
}

export default function CodingRobotItemRenderer({
  item,
  isSelected,
  isRunning,
  pulsePhase,
  onItemClick,
  onUpdateItem,
  setCodingRobotItemTransforms,
}: CodingRobotItemRendererProps) {
  const theme = CODING_ROBOT_THEME
  const pulseIntensity = isRunning ? (Math.sin(pulsePhase) + 1) / 2 : 0

  const borderColor = isRunning
    ? getPulseColor(pulseIntensity, theme.pulseBorder)
    : isSelected ? COLOR_SELECTED : theme.border

  const headerFill = isRunning && theme.pulseHeader
    ? getPulseColor(pulseIntensity, theme.pulseHeader)
    : theme.headerBg

  return (
    <Group
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height + CODING_ROBOT_HEADER_HEIGHT}
      draggable
      onClick={(e) => onItemClick(e, item.id)}
      onDragMove={(e) => {
        const node = e.target
        setCodingRobotItemTransforms((prev) => {
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
        setCodingRobotItemTransforms((prev) => {
          const next = new Map(prev)
          next.delete(item.id)
          return next
        })
      }}
      onTransform={(e) => {
        const node = e.target
        const scaleX = node.scaleX()
        const scaleY = node.scaleY()
        setCodingRobotItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(item.id, {
            x: node.x(),
            y: node.y(),
            width: item.width * scaleX,
            height: (item.height + CODING_ROBOT_HEADER_HEIGHT) * scaleY - CODING_ROBOT_HEADER_HEIGHT,
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
          height: Math.max(MIN_PROMPT_HEIGHT, (node.height() - CODING_ROBOT_HEADER_HEIGHT) * scaleY),
        })
        setCodingRobotItemTransforms((prev) => {
          const next = new Map(prev)
          next.delete(item.id)
          return next
        })
      }}
    >
      {/* Header bar */}
      <Rect
        width={item.width}
        height={CODING_ROBOT_HEADER_HEIGHT}
        fill={headerFill}
        stroke={borderColor}
        strokeWidth={isRunning ? 2 + pulseIntensity : (isSelected ? 2 : 1)}
        cornerRadius={[4, 4, 0, 0]}
      />
      {/* Label */}
      <Text
        x={8}
        y={6}
        text={item.label || 'Coding Robot'}
        fontSize={14}
        fontStyle="bold"
        fill={theme.headerText}
        width={item.width * 0.4}
        ellipsis={true}
      />
      {/* Root directory */}
      <Text
        x={item.width * 0.4 + 8}
        y={8}
        text={item.rootDirectory ? (navigator.platform.startsWith('Win') ? item.rootDirectory.replace(/\//g, '\\') : item.rootDirectory) : ''}
        fontSize={11}
        fill={theme.headerText}
        opacity={0.6}
        width={item.width * 0.6 - 36}
        ellipsis={true}
        align="right"
      />
      {/* Change directory button */}
      <Text
        x={item.width - 22}
        y={6}
        text={'\uD83D\uDCC1'}
        fontSize={13}
        cursor="pointer"
        onClick={(e) => {
          e.cancelBubble = true
          const current = item.rootDirectory ?? ''
          const newDir = window.prompt('Root directory:', current)
          if (newDir !== null && newDir !== current) {
            onUpdateItem(item.id, { rootDirectory: newDir.replace(/\\/g, '/') })
          }
        }}
      />
      {/* Body area - transparent rect for hit detection, DOM overlay renders on top */}
      <Rect
        y={CODING_ROBOT_HEADER_HEIGHT}
        width={item.width}
        height={item.height}
        fill={theme.itemBg}
        stroke={borderColor}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={[0, 0, 4, 4]}
      />
    </Group>
  )
}
