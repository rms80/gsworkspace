import React from 'react'
import { PdfItem } from '../../../types'
import { COLOR_SELECTED } from '../../../constants/canvas'

interface PdfLabelEditingOverlayProps {
  item: PdfItem
  inputRef: React.RefObject<HTMLInputElement>
  stageScale: number
  stagePos: { x: number; y: number }
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

export default function PdfLabelEditingOverlay({
  item,
  inputRef,
  stageScale,
  stagePos,
  onBlur,
  onKeyDown,
}: PdfLabelEditingOverlayProps) {
  return (
    <input
      ref={inputRef}
      defaultValue={item.name || 'PDF'}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      style={{
        position: 'absolute',
        top: item.y * stageScale + stagePos.y + 4 * stageScale,
        left: item.x * stageScale + stagePos.x + 8 * stageScale,
        width: (item.width - 80) * stageScale,
        height: 16 * stageScale,
        fontSize: 14 * stageScale,
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        padding: '0 2px',
        margin: 0,
        border: `2px solid ${COLOR_SELECTED}`,
        borderRadius: 2,
        outline: 'none',
        background: '#f8e8e8',
        color: '#333',
        boxSizing: 'border-box',
      }}
    />
  )
}
