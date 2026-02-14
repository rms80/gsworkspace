import { useRef } from 'react'
import { Rect, Text, Group } from 'react-konva'
import Konva from 'konva'
import { CanvasItem } from '../../../types'
import {
  PROMPT_HEADER_HEIGHT, RUN_BUTTON_WIDTH, MODEL_BUTTON_WIDTH,
  BUTTON_HEIGHT, BUTTON_GAP, MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT,
  COLOR_SELECTED,
  PromptThemeColors, getPulseColor,
} from '../../../constants/canvas'
import { PromptEditing } from '../../../hooks/usePromptEditing'
import { hasAnthropicApiKey, hasGoogleApiKey } from '../../../utils/apiKeyStorage'
import { snapToGrid, snapDragPos } from '../../../utils/grid'

interface PromptItemRendererProps {
  item: CanvasItem & { label: string; text: string; fontSize: number; width: number; height: number; model?: string }
  theme: PromptThemeColors
  isSelected: boolean
  isRunning: boolean
  isOffline: boolean
  pulsePhase: number
  editing: PromptEditing
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
  onOpenModelMenu?: (id: string, position: { x: number; y: number }) => void
  onRun: (id: string) => void
  onShowTooltip?: (tooltip: { text: string; x: number; y: number } | null) => void
  contextSummaryLines?: string[]
}

export default function PromptItemRenderer({
  item,
  theme,
  isSelected,
  isRunning,
  isOffline,
  pulsePhase,
  editing,
  onItemClick,
  onUpdateItem,
  onOpenModelMenu,
  onRun,
  onShowTooltip,
  contextSummaryLines,
}: PromptItemRendererProps) {
  const groupRef = useRef<Konva.Group>(null)
  const runButtonRef = useRef<Konva.Group>(null)
  const isEditingThis = editing.editingId === item.id
  const pulseIntensity = isRunning ? (Math.sin(pulsePhase) + 1) / 2 : 0

  // Check if we can run based on mode and API keys
  const hasModel = !!item.model
  const needsAnthropicKey = hasModel && item.model!.startsWith('claude-')
  const needsGoogleKey = hasModel && item.model!.startsWith('gemini-')
  const hasRequiredKey = needsAnthropicKey ? hasAnthropicApiKey() : needsGoogleKey ? hasGoogleApiKey() : false
  const isMissingApiKey = hasModel && isOffline && !hasRequiredKey
  const isRunDisabled = isRunning || isMissingApiKey

  // Tooltip message for missing API key
  const getTooltipMessage = () => {
    if (!isMissingApiKey) return null
    if (needsAnthropicKey) {
      return 'Anthropic API key required. Add it in Edit > Settings.'
    } else if (needsGoogleKey) {
      return 'Google API key required. Add it in Edit > Settings.'
    }
    return null
  }

  const borderColor = isRunning
    ? getPulseColor(pulseIntensity, theme.pulseBorder)
    : (isSelected ? COLOR_SELECTED : theme.border)
  const borderWidth = isRunning ? 2 + pulseIntensity : (isSelected ? 2 : 1)

  const runButtonColor = isRunning
    ? getPulseColor(pulseIntensity, theme.pulseRunButton)
    : isRunDisabled
      ? '#666' // Greyed out when disabled
      : theme.runButton

  return (
    <Group
      ref={groupRef}
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height}
      draggable={!isRunning}
      dragBoundFunc={(pos) => {
        const stage = groupRef.current?.getStage()
        return stage ? snapDragPos(pos, stage) : pos
      }}
      onClick={(e) => onItemClick(e, item.id)}
      onDragEnd={(e) => {
        onUpdateItem(item.id, { x: snapToGrid(e.target.x()), y: snapToGrid(e.target.y()) })
      }}
      onTransformEnd={(e) => {
        const node = e.target
        const scaleX = node.scaleX()
        const scaleY = node.scaleY()
        node.scaleX(1)
        node.scaleY(1)
        onUpdateItem(item.id, {
          x: snapToGrid(node.x()),
          y: snapToGrid(node.y()),
          width: Math.max(MIN_PROMPT_WIDTH, item.width * scaleX),
          height: Math.max(MIN_PROMPT_HEIGHT, item.height * scaleY),
        })
      }}
    >
      {/* Background */}
      <Rect
        width={item.width}
        height={item.height}
        fill={theme.itemBg}
        stroke={borderColor}
        strokeWidth={borderWidth}
        cornerRadius={4}
      />
      {/* Header background */}
      <Rect
        width={item.width}
        height={PROMPT_HEADER_HEIGHT}
        fill={theme.headerBg}
        cornerRadius={[4, 4, 0, 0]}
      />
      {/* Header label */}
      <Text
        text={item.label}
        x={8}
        y={6}
        width={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 24}
        height={PROMPT_HEADER_HEIGHT - 6}
        fontSize={14}
        fontStyle="bold"
        fill={theme.headerText}
        onDblClick={() => editing.handleLabelDblClick(item.id)}
        visible={!(isEditingThis && editing.editingField === 'label')}
      />
      {/* Model selector button (only shown when item has a model) */}
      {onOpenModelMenu && hasModel && (
        <>
          <Rect
            x={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 8}
            y={4}
            width={MODEL_BUTTON_WIDTH}
            height={BUTTON_HEIGHT}
            fill="#666"
            cornerRadius={3}
            onClick={(e) => {
              e.cancelBubble = true
              onOpenModelMenu(item.id, { x: e.evt.clientX, y: e.evt.clientY })
            }}
          />
          <Text
            x={item.width - RUN_BUTTON_WIDTH - MODEL_BUTTON_WIDTH - BUTTON_GAP - 8}
            y={4}
            text="..."
            width={MODEL_BUTTON_WIDTH}
            height={BUTTON_HEIGHT}
            fontSize={12}
            fontStyle="bold"
            fill="#fff"
            align="center"
            verticalAlign="middle"
            listening={false}
          />
        </>
      )}
      {/* Run button */}
      <Group
        ref={runButtonRef}
        x={item.width - RUN_BUTTON_WIDTH - 8}
        y={4}
        onClick={(e) => {
          e.cancelBubble = true
          if (!isRunDisabled) {
            onRun(item.id)
          }
        }}
        onMouseEnter={() => {
          if (!onShowTooltip) return
          const tooltipMsg = getTooltipMessage()
          const text = tooltipMsg ?? contextSummaryLines?.join('\n')
          if (!text) return
          // Compute screen position of the Run button's top-left
          const node = runButtonRef.current
          const stage = node?.getStage()
          const container = stage?.container()
          if (!node || !container) return
          const absPos = node.getAbsolutePosition()
          const containerRect = container.getBoundingClientRect()
          onShowTooltip({
            text,
            x: absPos.x + containerRect.left,
            y: absPos.y + containerRect.top,
          })
        }}
        onMouseLeave={() => {
          if (onShowTooltip) {
            onShowTooltip(null)
          }
        }}
      >
        <Rect
          width={RUN_BUTTON_WIDTH}
          height={BUTTON_HEIGHT}
          fill={runButtonColor}
          cornerRadius={3}
        />
        <Text
          text={isRunning ? '...' : 'Run'}
          width={RUN_BUTTON_WIDTH}
          height={BUTTON_HEIGHT}
          fontSize={12}
          fontStyle="bold"
          fill={isRunDisabled && !isRunning ? '#999' : '#fff'}
          align="center"
          verticalAlign="middle"
        />
      </Group>
      {/* Content text */}
      <Text
        text={item.text}
        x={8}
        y={PROMPT_HEADER_HEIGHT + 8}
        width={item.width - 16}
        height={item.height - PROMPT_HEADER_HEIGHT - 16}
        fontSize={item.fontSize}
        fill={theme.contentText}
        onDblClick={() => editing.handleTextDblClick(item.id)}
        visible={!(isEditingThis && editing.editingField === 'text')}
      />
    </Group>
  )
}
