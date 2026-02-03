import React from 'react'
import { ImageItem } from '../../../types'
import { IMAGE_HEADER_HEIGHT, COLOR_SELECTED } from '../../../constants/canvas'

interface ImageLabelEditingOverlayProps {
  item: ImageItem
  inputRef: React.RefObject<HTMLInputElement>
  stageScale: number
  stagePos: { x: number; y: number }
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

export default function ImageLabelEditingOverlay({
  item,
  inputRef,
  stageScale,
  stagePos,
  onBlur,
  onKeyDown,
}: ImageLabelEditingOverlayProps) {
  const scaleX = item.scaleX ?? 1
  const displayWidth = item.width * scaleX

  return (
    <input
      ref={inputRef}
      defaultValue={item.name || 'Image'}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      style={{
        position: 'absolute',
        // Position in header bar (above the image)
        top: (item.y - IMAGE_HEADER_HEIGHT) * stageScale + stagePos.y + 4 * stageScale,
        left: item.x * stageScale + stagePos.x + 8 * stageScale,
        width: (displayWidth - 16) * stageScale,
        height: 16 * stageScale,
        fontSize: 14 * stageScale,
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        padding: '0 2px',
        margin: 0,
        border: `2px solid ${COLOR_SELECTED}`,
        borderRadius: 2,
        outline: 'none',
        background: '#3a3a6e',
        color: '#fff',
        boxSizing: 'border-box',
      }}
    />
  )
}
