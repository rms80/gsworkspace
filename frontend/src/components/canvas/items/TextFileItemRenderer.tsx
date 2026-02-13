import { useState, useRef, useLayoutEffect } from 'react'
import { Rect, Text, Group } from 'react-konva'
import Konva from 'konva'
import { TextFileItem } from '../../../types'
import {
  TEXTFILE_HEADER_HEIGHT, TEXTFILE_MINIMIZED_WIDTH, TEXTFILE_MINIMIZED_HEIGHT,
  MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT,
  COLOR_SELECTED, COLOR_BORDER_DEFAULT,
} from '../../../constants/canvas'
import { snapToGrid } from '../../../utils/grid'
import { config } from '../../../config'

interface TextFileItemRendererProps {
  item: TextFileItem
  isSelected: boolean
  editingTextFileLabelId: string | null
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<TextFileItem>) => void
  onLabelDblClick: (id: string) => void
  onToggleMinimized: (id: string) => void
  onToggleMono: (id: string) => void
  onChangeFontSize: (id: string, delta: number) => void
  setTextFileItemTransforms: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; width: number; height: number }>>>
  setIsViewportTransforming: (v: boolean) => void
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export default function TextFileItemRenderer({
  item,
  isSelected,
  editingTextFileLabelId,
  onItemClick,
  onUpdateItem,
  onLabelDblClick,
  onToggleMinimized,
  onToggleMono,
  onChangeFontSize,
  setTextFileItemTransforms,
  setIsViewportTransforming,
}: TextFileItemRendererProps) {
  const minimized = item.minimized ?? false
  const labelTextRef = useRef<Konva.Text>(null)
  const [labelHeight, setLabelHeight] = useState(14)

  // Measure wrapped label text height
  useLayoutEffect(() => {
    if (minimized && labelTextRef.current) {
      setLabelHeight(labelTextRef.current.height())
    }
  }, [minimized, item.name])

  const labelPadding = 6
  const labelBarHeight = labelHeight + labelPadding * 2

  if (minimized) {
    const badgeText = item.fileFormat === 'csv' ? 'CSV' : 'TXT'
    return (
      <Group
        key={item.id}
        id={item.id}
        x={item.x}
        y={item.y}
        width={TEXTFILE_MINIMIZED_WIDTH}
        height={TEXTFILE_MINIMIZED_HEIGHT}
        draggable
        dragBoundFunc={(pos) => ({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) })}
        onClick={(e) => onItemClick(e, item.id)}
        onDblClick={(e) => { if (e.evt.button === 0) onToggleMinimized(item.id) }}
        onDragMove={(e) => {
          const node = e.target
          setTextFileItemTransforms((prev) => {
            const next = new Map(prev)
            next.set(item.id, {
              x: node.x(),
              y: node.y(),
              width: TEXTFILE_MINIMIZED_WIDTH,
              height: TEXTFILE_MINIMIZED_HEIGHT,
            })
            return next
          })
        }}
        onDragEnd={(e) => {
          onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
          setTextFileItemTransforms((prev) => {
            const next = new Map(prev)
            next.delete(item.id)
            return next
          })
        }}
      >
        {/* Background fill */}
        <Rect
          width={TEXTFILE_MINIMIZED_WIDTH}
          height={TEXTFILE_MINIMIZED_HEIGHT}
          fill="#f0efe8"
          cornerRadius={6}
        />
        {/* File type icon area */}
        <Rect
          x={30}
          y={30}
          width={60}
          height={70}
          fill="#e0ddd0"
          cornerRadius={4}
        />
        <Text
          x={30}
          y={55}
          text={badgeText}
          width={60}
          fontSize={16}
          fontStyle="bold"
          fill="#777"
          align="center"
        />
        {/* Top-left badge */}
        <Rect
          x={0}
          y={0}
          width={40}
          height={20}
          fill="rgba(0,0,0,0.5)"
          cornerRadius={[6, 0, 4, 0]}
        />
        <Text
          x={0}
          y={5}
          text={badgeText}
          width={40}
          fontSize={12}
          fontStyle="bold"
          fill="#fff"
          align="center"
        />
        {/* Bottom bar with name */}
        <Rect
          y={TEXTFILE_MINIMIZED_HEIGHT - labelBarHeight}
          width={TEXTFILE_MINIMIZED_WIDTH}
          height={labelBarHeight}
          fill="rgba(0,0,0,0.5)"
          cornerRadius={[0, 0, 6, 6]}
        />
        <Text
          ref={labelTextRef}
          x={6}
          y={TEXTFILE_MINIMIZED_HEIGHT - labelBarHeight + labelPadding}
          text={item.name || 'TextFile'}
          fontSize={11}
          fill="#fff"
          width={TEXTFILE_MINIMIZED_WIDTH - 12}
          wrap="word"
        />
        {/* Border */}
        <Rect
          width={TEXTFILE_MINIMIZED_WIDTH}
          height={TEXTFILE_MINIMIZED_HEIGHT}
          stroke={isSelected ? COLOR_SELECTED : '#b0a880'}
          strokeWidth={isSelected ? 2 : 1}
          cornerRadius={6}
          listening={false}
        />
      </Group>
    )
  }

  // Expanded state
  const MINIMIZE_BTN_WIDTH = 18
  const MONO_BTN_WIDTH = 36
  const FONTSIZE_BTN_WIDTH = 24
  const fileSizeText = formatFileSize(item.fileSize)
  const fileSizeWidth = fileSizeText ? fileSizeText.length * 7 + 8 : 0
  const fontMono = item.fontMono ?? false

  return (
    <Group
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height + TEXTFILE_HEADER_HEIGHT}
      draggable
      dragBoundFunc={(pos) => ({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) })}
      onClick={(e) => onItemClick(e, item.id)}
      onDragStart={() => {
        if (config.features.hideHtmlDuringTransform) {
          setIsViewportTransforming(true)
        }
      }}
      onDragMove={(e) => {
        const node = e.target
        setTextFileItemTransforms((prev) => {
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
        setTextFileItemTransforms((prev) => {
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
        setTextFileItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(item.id, {
            x: node.x(),
            y: node.y(),
            width: item.width * scaleX,
            height: (item.height + TEXTFILE_HEADER_HEIGHT) * scaleY - TEXTFILE_HEADER_HEIGHT,
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
          height: Math.max(MIN_PROMPT_HEIGHT, (node.height() - TEXTFILE_HEADER_HEIGHT) * scaleY),
        })
        setTextFileItemTransforms((prev) => {
          const next = new Map(prev)
          next.delete(item.id)
          return next
        })
        if (config.features.hideHtmlDuringTransform) {
          setIsViewportTransforming(false)
        }
      }}
    >
      {/* Header bar */}
      <Rect
        width={item.width}
        height={TEXTFILE_HEADER_HEIGHT}
        fill="#d8e8d8"
        stroke={isSelected ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={[4, 4, 0, 0]}
      />
      {/* Label text */}
      <Text
        x={8}
        y={4}
        text={item.name || 'TextFile'}
        fontSize={14}
        fontStyle="bold"
        fill="#333"
        width={item.width - MINIMIZE_BTN_WIDTH - MONO_BTN_WIDTH - FONTSIZE_BTN_WIDTH * 2 - fileSizeWidth - 40}
        ellipsis={true}
        onDblClick={() => onLabelDblClick(item.id)}
        visible={editingTextFileLabelId !== item.id}
      />
      {/* File size display */}
      {fileSizeText && (
        <Text
          x={item.width - MINIMIZE_BTN_WIDTH - MONO_BTN_WIDTH - FONTSIZE_BTN_WIDTH * 2 - fileSizeWidth - 16}
          y={7}
          text={fileSizeText}
          fontSize={10}
          fill="#888"
        />
      )}
      {/* Font size - button */}
      <Group
        x={item.width - MINIMIZE_BTN_WIDTH - MONO_BTN_WIDTH - FONTSIZE_BTN_WIDTH * 2 - 12}
        y={4}
        onClick={(e) => {
          e.cancelBubble = true
          onChangeFontSize(item.id, -2)
        }}
      >
        <Rect
          width={FONTSIZE_BTN_WIDTH}
          height={16}
          fill="#888"
          cornerRadius={3}
        />
        <Text
          text="-"
          width={FONTSIZE_BTN_WIDTH}
          height={16}
          fontSize={12}
          fontStyle="bold"
          fill="#fff"
          align="center"
          verticalAlign="middle"
        />
      </Group>
      {/* Font size + button */}
      <Group
        x={item.width - MINIMIZE_BTN_WIDTH - MONO_BTN_WIDTH - FONTSIZE_BTN_WIDTH - 10}
        y={4}
        onClick={(e) => {
          e.cancelBubble = true
          onChangeFontSize(item.id, 2)
        }}
      >
        <Rect
          width={FONTSIZE_BTN_WIDTH}
          height={16}
          fill="#888"
          cornerRadius={3}
        />
        <Text
          text="+"
          width={FONTSIZE_BTN_WIDTH}
          height={16}
          fontSize={12}
          fontStyle="bold"
          fill="#fff"
          align="center"
          verticalAlign="middle"
        />
      </Group>
      {/* Mono toggle button */}
      <Group
        x={item.width - MINIMIZE_BTN_WIDTH - MONO_BTN_WIDTH - 6}
        y={4}
        onClick={(e) => {
          e.cancelBubble = true
          onToggleMono(item.id)
        }}
      >
        <Rect
          width={MONO_BTN_WIDTH}
          height={16}
          fill={fontMono ? '#4a7c59' : '#888'}
          cornerRadius={3}
        />
        <Text
          text="mono"
          width={MONO_BTN_WIDTH}
          height={16}
          fontSize={10}
          fill="#fff"
          align="center"
          verticalAlign="middle"
        />
      </Group>
      {/* Minimize button */}
      <Group
        x={item.width - MINIMIZE_BTN_WIDTH - 4}
        y={4}
        onClick={(e) => {
          e.cancelBubble = true
          onToggleMinimized(item.id)
        }}
      >
        <Rect
          width={MINIMIZE_BTN_WIDTH}
          height={16}
          fill="#888"
          cornerRadius={3}
        />
        <Text
          text="_"
          width={MINIMIZE_BTN_WIDTH}
          height={16}
          fontSize={11}
          fontStyle="bold"
          fill="#fff"
          align="center"
          verticalAlign="middle"
        />
      </Group>
      {/* Content area background (iframe overlays this) */}
      <Rect
        y={TEXTFILE_HEADER_HEIGHT}
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
