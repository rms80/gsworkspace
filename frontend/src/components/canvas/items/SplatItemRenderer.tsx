import { useState, useRef, useLayoutEffect } from 'react'
import { Rect, Text, Group } from 'react-konva'
import Konva from 'konva'
import { SplatItem } from '../../../types'
import {
  SPLAT_HEADER_HEIGHT, SPLAT_MINIMIZED_WIDTH, SPLAT_MINIMIZED_HEIGHT,
  MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT,
  COLOR_SELECTED, COLOR_BORDER_DEFAULT,
} from '../../../constants/canvas'
import { snapToGrid, snapDragPos } from '../../../utils/grid'
import { config } from '../../../config'

interface SplatItemRendererProps {
  item: SplatItem
  isSelected: boolean
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<SplatItem>) => void
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onToggleMinimized: (id: string) => void
  setSplatItemTransforms: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; width: number; height: number }>>>
  setIsViewportTransforming: (v: boolean) => void
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

export default function SplatItemRenderer({
  item,
  isSelected,
  onItemClick,
  onContextMenu,
  onUpdateItem,
  onToggleMinimized,
  setSplatItemTransforms,
  setIsViewportTransforming,
}: SplatItemRendererProps) {
  const minimized = item.minimized ?? false
  const groupRef = useRef<Konva.Group>(null)
  const labelTextRef = useRef<Konva.Text>(null)
  const [labelHeight, setLabelHeight] = useState(14)

  useLayoutEffect(() => {
    if (minimized && labelTextRef.current) {
      setLabelHeight(labelTextRef.current.height())
    }
  }, [minimized, item.name])

  const labelPadding = 6
  const labelBarHeight = labelHeight + labelPadding * 2

  if (minimized) {
    return (
      <Group
        ref={groupRef}
        key={item.id}
        id={item.id}
        x={item.x}
        y={item.y}
        width={SPLAT_MINIMIZED_WIDTH}
        height={SPLAT_MINIMIZED_HEIGHT}
        draggable
        dragBoundFunc={(pos) => {
          const stage = groupRef.current?.getStage()
          return stage ? snapDragPos(pos, stage) : pos
        }}
        onClick={(e) => onItemClick(e, item.id)}
        onContextMenu={(e) => {
          e.evt.preventDefault()
          e.cancelBubble = true
          onContextMenu(e, item.id)
        }}
        onDblClick={(e) => { if (e.evt.button === 0) onToggleMinimized(item.id) }}
        onDragMove={(e) => {
          const node = e.target
          setSplatItemTransforms((prev) => {
            const next = new Map(prev)
            next.set(item.id, {
              x: node.x(),
              y: node.y(),
              width: SPLAT_MINIMIZED_WIDTH,
              height: SPLAT_MINIMIZED_HEIGHT,
            })
            return next
          })
        }}
        onDragEnd={(e) => {
          onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
          setSplatItemTransforms((prev) => {
            const next = new Map(prev)
            next.delete(item.id)
            return next
          })
        }}
      >
        <Rect
          width={SPLAT_MINIMIZED_WIDTH}
          height={SPLAT_MINIMIZED_HEIGHT}
          fill="#1a1a2e"
          cornerRadius={6}
        />
        <Rect
          x={0}
          y={0}
          width={42}
          height={20}
          fill="rgba(180,100,255,0.7)"
          cornerRadius={[6, 0, 4, 0]}
        />
        <Text
          x={0}
          y={5}
          text="SPLAT"
          width={42}
          fontSize={10}
          fontStyle="bold"
          fill="#fff"
          align="center"
        />
        <Rect
          y={SPLAT_MINIMIZED_HEIGHT - labelBarHeight}
          width={SPLAT_MINIMIZED_WIDTH}
          height={labelBarHeight}
          fill="rgba(0,0,0,0.5)"
          cornerRadius={[0, 0, 6, 6]}
        />
        <Text
          ref={labelTextRef}
          x={6}
          y={SPLAT_MINIMIZED_HEIGHT - labelBarHeight + labelPadding}
          text={item.name || 'Splat'}
          fontSize={11}
          fill="#fff"
          width={SPLAT_MINIMIZED_WIDTH - 12}
          wrap="word"
        />
        <Rect
          width={SPLAT_MINIMIZED_WIDTH}
          height={SPLAT_MINIMIZED_HEIGHT}
          stroke={isSelected ? COLOR_SELECTED : '#4a4a6a'}
          strokeWidth={isSelected ? 2 : 1}
          cornerRadius={6}
          listening={false}
        />
      </Group>
    )
  }

  const MINIMIZE_BTN_WIDTH = 18
  const fileSizeText = formatFileSize(item.fileSize)
  const fileSizeWidth = fileSizeText ? fileSizeText.length * 7 + 8 : 0

  return (
    <Group
      ref={groupRef}
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height + SPLAT_HEADER_HEIGHT}
      draggable
      dragBoundFunc={(pos) => {
        const stage = groupRef.current?.getStage()
        return stage ? snapDragPos(pos, stage) : pos
      }}
      onClick={(e) => onItemClick(e, item.id)}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        e.cancelBubble = true
        onContextMenu(e, item.id)
      }}
      onDragStart={() => {
        if (config.features.hideHtmlDuringTransform) {
          setIsViewportTransforming(true)
        }
      }}
      onDragMove={(e) => {
        const node = e.target
        setSplatItemTransforms((prev) => {
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
        setSplatItemTransforms((prev) => {
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
        setSplatItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(item.id, {
            x: node.x(),
            y: node.y(),
            width: item.width * scaleX,
            height: (item.height + SPLAT_HEADER_HEIGHT) * scaleY - SPLAT_HEADER_HEIGHT,
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
          height: Math.max(MIN_PROMPT_HEIGHT, (node.height() - SPLAT_HEADER_HEIGHT) * scaleY),
        })
        setSplatItemTransforms((prev) => {
          const next = new Map(prev)
          next.delete(item.id)
          return next
        })
        if (config.features.hideHtmlDuringTransform) {
          setIsViewportTransforming(false)
        }
      }}
    >
      <Rect
        width={item.width}
        height={SPLAT_HEADER_HEIGHT}
        fill="#3a2a4a"
        stroke={isSelected ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={[4, 4, 0, 0]}
      />
      <Text
        x={8}
        y={4}
        text={item.name || 'Gaussian Splat'}
        fontSize={14}
        fontStyle="bold"
        fill="#ddd"
        width={item.width - MINIMIZE_BTN_WIDTH - fileSizeWidth - 24}
        ellipsis={true}
      />
      {fileSizeText && (
        <Text
          x={item.width - MINIMIZE_BTN_WIDTH - fileSizeWidth - 8}
          y={7}
          text={fileSizeText}
          fontSize={10}
          fill="#888"
        />
      )}
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
      <Rect
        y={SPLAT_HEADER_HEIGHT}
        width={item.width}
        height={item.height}
        fill="#1a1a2e"
        stroke={isSelected ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={[0, 0, 4, 4]}
      />
    </Group>
  )
}
