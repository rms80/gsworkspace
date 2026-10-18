import { useMemo, useRef, useState } from 'react'
import { Rect, Text, Group, Path } from 'react-konva'
import Konva from 'konva'
import { CodingRobotItem } from '../../../types'
import {
  CODING_ROBOT_HEADER_HEIGHT,
  CODING_ROBOT_BORDER_WIDTH,
  COLOR_SELECTED,
  MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT,
  CODING_ROBOT_THEME,
  getPulseColor,
} from '../../../constants/canvas'
import { browserIsOnServer, copyText } from '../../../utils/robotFolder'
import { snapToGrid, snapDragPos } from '../../../utils/grid'

const PATH_FONT_SIZE = 11

/** The path as this OS writes it */
const displayPath = (path: string) => (navigator.platform.startsWith('Win') ? path.replace(/\//g, '\\') : path)

/** Sets the stage's cursor and native tooltip */
function setCursor(e: Konva.KonvaEventObject<MouseEvent>, cursor: string, title: string) {
  const container = e.target.getStage()?.container()
  if (!container) return
  container.style.cursor = cursor
  container.title = title
}

interface CodingRobotItemRendererProps {
  item: CodingRobotItem
  isSelected: boolean
  isRunning: boolean
  pulsePhase: number
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<CodingRobotItem>) => void
  onFolderClick: (item: CodingRobotItem) => void
  onOpenFolder: (item: CodingRobotItem, folder: string) => void
  isEditingLabel: boolean
  onLabelDblClick: (id: string) => void
  /** The session's working folder, once it has a session (for robots with a folder of their own) */
  sessionFolder?: string | null
  setCodingRobotItemTransforms: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; width: number; height: number }>>>
}

export default function CodingRobotItemRenderer({
  item,
  isSelected,
  isRunning,
  pulsePhase,
  onItemClick,
  onUpdateItem,
  onFolderClick,
  onOpenFolder,
  isEditingLabel,
  onLabelDblClick,
  sessionFolder,
  setCodingRobotItemTransforms,
}: CodingRobotItemRendererProps) {
  const theme = CODING_ROBOT_THEME
  const groupRef = useRef<Konva.Group>(null)
  const [buttonHover, setButtonHover] = useState(false)
  const [pathHover, setPathHover] = useState(false)
  const [copied, setCopied] = useState(false)

  // The folder the agent works in, if known: the one chosen, or the session's own
  const folderPath = item.rootDirectory || sessionFolder || null
  const canOpen = browserIsOnServer()
  const pathText = item.rootDirectory ? displayPath(item.rootDirectory) : 'own folder'
  // Sized to the text, so only the text itself is clickable
  const pathRight = item.width - 30
  const pathMaxWidth = Math.max(0, item.width * 0.6 - 36)
  const pathWidth = useMemo(() => {
    const measured = new Konva.Text({ text: copied ? 'Copied' : pathText, fontSize: PATH_FONT_SIZE }).width()
    return Math.min(Math.ceil(measured) + 1, pathMaxWidth)
  }, [pathText, copied, pathMaxWidth])
  const pulseIntensity = isRunning ? (Math.sin(pulsePhase) + 1) / 2 : 0

  const borderColor = isRunning
    ? getPulseColor(pulseIntensity, theme.pulseBorder)
    : isSelected ? COLOR_SELECTED : theme.border

  const headerFill = isRunning && theme.pulseHeader
    ? getPulseColor(pulseIntensity, theme.pulseHeader)
    : theme.headerBg

  return (
    <Group
      ref={groupRef}
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height + CODING_ROBOT_HEADER_HEIGHT}
      draggable
      dragBoundFunc={(pos) => {
        const stage = groupRef.current?.getStage()
        return stage ? snapDragPos(pos, stage) : pos
      }}
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
        onUpdateItem(item.id, { x: snapToGrid(e.target.x()), y: snapToGrid(e.target.y()) })
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
          x: snapToGrid(node.x()),
          y: snapToGrid(node.y()),
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
        onDblClick={() => onLabelDblClick(item.id)}
        visible={!isEditingLabel}
      />
      {/* Root directory: click opens it (browser on the server machine), Shift+click copies it */}
      <Text
        x={pathRight - pathWidth}
        y={0}
        height={CODING_ROBOT_HEADER_HEIGHT}
        verticalAlign="middle"
        text={copied ? 'Copied' : pathText}
        fontSize={PATH_FONT_SIZE}
        fill={theme.headerText}
        opacity={pathHover && folderPath ? 1 : 0.6}
        width={pathWidth}
        ellipsis={true}
        align="right"
        onClick={(e) => {
          if (!folderPath) return
          e.cancelBubble = true
          if (e.evt.shiftKey) {
            void copyText(displayPath(folderPath)).then((ok) => {
              if (!ok) return
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            })
          } else if (canOpen) {
            onOpenFolder(item, folderPath)
          }
        }}
        onMouseEnter={(e) => {
          if (!folderPath) return
          setPathHover(true)
          setCursor(e, canOpen ? 'pointer' : 'copy', canOpen
            ? `${displayPath(folderPath)}\nClick to open in the file manager. Shift+click to copy the path.`
            : `${displayPath(folderPath)}\nShift+click to copy the path.`)
        }}
        onMouseLeave={(e) => {
          setPathHover(false)
          setCursor(e, '', '')
        }}
      />
      {/* Change directory button */}
      <Group
        x={item.width - 24}
        y={4}
        onClick={(e) => {
          e.cancelBubble = true
          onFolderClick(item)
        }}
        onMouseEnter={(e) => {
          setButtonHover(true)
          setCursor(e, 'pointer', 'Choose the folder the agent works in')
        }}
        onMouseLeave={(e) => {
          setButtonHover(false)
          setCursor(e, '', '')
        }}
      >
        <Rect
          width={20}
          height={20}
          // Darker than the header, more so on hover (translucent, so it follows the running pulse)
          fill={buttonHover ? 'rgba(0, 0, 0, 0.22)' : 'rgba(0, 0, 0, 0.08)'}
          stroke={theme.headerText}
          strokeWidth={1}
          cornerRadius={3}
          opacity={buttonHover ? 0.9 : 0.5}
        />
        {/* Folder icon: a 20x16 shape in a 24-unit box at (2,4), scaled to 12x9.6 and centered in the 20x20 button */}
        <Path
          x={2.8}
          y={2.8}
          scaleX={0.6}
          scaleY={0.6}
          data="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"
          fill={buttonHover ? '#f7c45e' : '#f2b33d'}
          listening={false}
        />
      </Group>
      {/* Body area - transparent rect for hit detection, DOM overlay renders on top */}
      <Rect
        y={CODING_ROBOT_HEADER_HEIGHT}
        width={item.width}
        height={item.height}
        fill={theme.itemBg}
        cornerRadius={[0, 0, 4, 4]}
      />
      {/* One border around the whole robot, drawn last so the header doesn't cover it. Its width
          never changes (see CODING_ROBOT_BORDER_WIDTH), so the body overlay never covers it */}
      <Rect
        width={item.width}
        height={item.height + CODING_ROBOT_HEADER_HEIGHT}
        stroke={borderColor}
        strokeWidth={CODING_ROBOT_BORDER_WIDTH}
        cornerRadius={4}
        listening={false}
      />
    </Group>
  )
}
