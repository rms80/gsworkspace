import { useState, useEffect, useMemo, useRef, useLayoutEffect } from 'react'
import { Rect, Text, Group, Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import { PdfItem } from '../../../types'
import {
  PDF_HEADER_HEIGHT, PDF_MINIMIZED_WIDTH, PDF_MINIMIZED_HEIGHT,
  MIN_PROMPT_WIDTH, MIN_PROMPT_HEIGHT,
  COLOR_SELECTED, COLOR_BORDER_DEFAULT,
} from '../../../constants/canvas'
import { snapToGrid } from '../../../utils/grid'
import { config } from '../../../config'

interface PdfItemRendererProps {
  item: PdfItem
  isSelected: boolean
  editingPdfLabelId: string | null
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<PdfItem>) => void
  onLabelDblClick: (id: string) => void
  onToggleMinimized: (id: string) => void
  setPdfItemTransforms: React.Dispatch<React.SetStateAction<Map<string, { x: number; y: number; width: number; height: number }>>>
  setIsViewportTransforming: (v: boolean) => void
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function useLoadedImage(src: string | undefined): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!src) { setImage(null); return }
    const img = new window.Image()
    img.onload = () => setImage(img)
    img.src = src
  }, [src])
  return image
}

export default function PdfItemRenderer({
  item,
  isSelected,
  editingPdfLabelId,
  onItemClick,
  onUpdateItem,
  onLabelDblClick,
  onToggleMinimized,
  setPdfItemTransforms,
  setIsViewportTransforming,
}: PdfItemRendererProps) {
  const minimized = item.minimized ?? false
  const thumbnailImage = useLoadedImage(minimized ? item.thumbnailSrc : undefined)
  const labelTextRef = useRef<Konva.Text>(null)
  const [labelHeight, setLabelHeight] = useState(14) // single line default

  // Fit thumbnail inside the box (contain-fit, no cropping)
  const fitProps = useMemo(() => {
    if (!thumbnailImage) return null
    const imgW = thumbnailImage.naturalWidth
    const imgH = thumbnailImage.naturalHeight
    if (!imgW || !imgH) return null
    const boxW = PDF_MINIMIZED_WIDTH
    const boxH = PDF_MINIMIZED_HEIGHT
    const scale = Math.min(boxW / imgW, boxH / imgH)
    const w = imgW * scale
    const h = imgH * scale
    // Center within the box
    const x = (boxW - w) / 2
    const y = (boxH - h) / 2
    return { x, y, w, h }
  }, [thumbnailImage])

  // Measure wrapped label text height
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
        key={item.id}
        id={item.id}
        x={item.x}
        y={item.y}
        width={PDF_MINIMIZED_WIDTH}
        height={PDF_MINIMIZED_HEIGHT}
        draggable
        dragBoundFunc={(pos) => ({ x: snapToGrid(pos.x), y: snapToGrid(pos.y) })}
        onClick={(e) => onItemClick(e, item.id)}
        onDblClick={() => onToggleMinimized(item.id)}
        onDragMove={(e) => {
          const node = e.target
          setPdfItemTransforms((prev) => {
            const next = new Map(prev)
            next.set(item.id, {
              x: node.x(),
              y: node.y(),
              width: PDF_MINIMIZED_WIDTH,
              height: PDF_MINIMIZED_HEIGHT,
            })
            return next
          })
        }}
        onDragEnd={(e) => {
          onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
          setPdfItemTransforms((prev) => {
            const next = new Map(prev)
            next.delete(item.id)
            return next
          })
        }}
      >
        {/* Background fill (behind image) */}
        <Rect
          width={PDF_MINIMIZED_WIDTH}
          height={PDF_MINIMIZED_HEIGHT}
          fill="#f5f0e8"
          cornerRadius={6}
        />
        {/* Thumbnail image clipped to rounded rect */}
        <Group
          clipFunc={(ctx) => {
            const r = 6
            const w = PDF_MINIMIZED_WIDTH
            const h = PDF_MINIMIZED_HEIGHT
            ctx.beginPath()
            ctx.moveTo(r, 0)
            ctx.lineTo(w - r, 0)
            ctx.arcTo(w, 0, w, r, r)
            ctx.lineTo(w, h - r)
            ctx.arcTo(w, h, w - r, h, r)
            ctx.lineTo(r, h)
            ctx.arcTo(0, h, 0, h - r, r)
            ctx.lineTo(0, r)
            ctx.arcTo(0, 0, r, 0, r)
            ctx.closePath()
          }}
        >
          {thumbnailImage && fitProps && (
            <KonvaImage
              image={thumbnailImage}
              x={fitProps.x}
              y={fitProps.y}
              width={fitProps.w}
              height={fitProps.h}
            />
          )}
        </Group>
        {/* Top-left "PDF" badge */}
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
          text="PDF"
          width={40}
          fontSize={12}
          fontStyle="bold"
          fill="#fff"
          align="center"
        />
        {/* Bottom bar with name (grows upward for wrapped text) */}
        <Rect
          y={PDF_MINIMIZED_HEIGHT - labelBarHeight}
          width={PDF_MINIMIZED_WIDTH}
          height={labelBarHeight}
          fill="rgba(0,0,0,0.5)"
          cornerRadius={[0, 0, 6, 6]}
        />
        <Text
          ref={labelTextRef}
          x={6}
          y={PDF_MINIMIZED_HEIGHT - labelBarHeight + labelPadding}
          text={item.name || 'PDF'}
          fontSize={11}
          fill="#fff"
          width={PDF_MINIMIZED_WIDTH - 12}
          wrap="word"
        />
        {/* Border on top of everything */}
        <Rect
          width={PDF_MINIMIZED_WIDTH}
          height={PDF_MINIMIZED_HEIGHT}
          stroke={isSelected ? COLOR_SELECTED : '#b0a080'}
          strokeWidth={isSelected ? 2 : 1}
          cornerRadius={6}
          listening={false}
        />
      </Group>
    )
  }

  // Expanded state
  const MINIMIZE_BTN_WIDTH = 18
  const fileSizeText = formatFileSize(item.fileSize)
  const fileSizeWidth = fileSizeText ? fileSizeText.length * 7 + 8 : 0

  return (
    <Group
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      width={item.width}
      height={item.height + PDF_HEADER_HEIGHT}
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
        setPdfItemTransforms((prev) => {
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
        setPdfItemTransforms((prev) => {
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
        setPdfItemTransforms((prev) => {
          const next = new Map(prev)
          next.set(item.id, {
            x: node.x(),
            y: node.y(),
            width: item.width * scaleX,
            height: (item.height + PDF_HEADER_HEIGHT) * scaleY - PDF_HEADER_HEIGHT,
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
          height: Math.max(MIN_PROMPT_HEIGHT, (node.height() - PDF_HEADER_HEIGHT) * scaleY),
        })
        setPdfItemTransforms((prev) => {
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
        height={PDF_HEADER_HEIGHT}
        fill="#e8d0d0"
        stroke={isSelected ? COLOR_SELECTED : COLOR_BORDER_DEFAULT}
        strokeWidth={isSelected ? 2 : 1}
        cornerRadius={[4, 4, 0, 0]}
      />
      {/* Label text */}
      <Text
        x={8}
        y={4}
        text={item.name || 'PDF'}
        fontSize={14}
        fontStyle="bold"
        fill="#333"
        width={item.width - MINIMIZE_BTN_WIDTH - fileSizeWidth - 24}
        ellipsis={true}
        onDblClick={() => onLabelDblClick(item.id)}
        visible={editingPdfLabelId !== item.id}
      />
      {/* File size display */}
      {fileSizeText && (
        <Text
          x={item.width - MINIMIZE_BTN_WIDTH - fileSizeWidth - 8}
          y={7}
          text={fileSizeText}
          fontSize={10}
          fill="#888"
        />
      )}
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
        y={PDF_HEADER_HEIGHT}
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
