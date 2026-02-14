import React from 'react'
import { TextFileItem } from '../../../types'
import { COLOR_SELECTED } from '../../../constants/canvas'

interface TextFileLabelEditingOverlayProps {
  item: TextFileItem
  inputRef: React.RefObject<HTMLInputElement>
  stageScale: number
  stagePos: { x: number; y: number }
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

export default function TextFileLabelEditingOverlay({
  item,
  inputRef,
  stageScale,
  stagePos,
  onBlur,
  onKeyDown,
}: TextFileLabelEditingOverlayProps) {
  return (
    <input
      ref={inputRef}
      defaultValue={item.name || 'TextFile'}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      style={{
        position: 'absolute',
        top: item.y * stageScale + stagePos.y + 4 * stageScale,
        left: item.x * stageScale + stagePos.x + 8 * stageScale,
        width: (item.width - 180) * stageScale,
        height: 16 * stageScale,
        fontSize: 14 * stageScale,
        fontFamily: 'sans-serif',
        fontWeight: 'bold',
        padding: '0 2px',
        margin: 0,
        border: `2px solid ${COLOR_SELECTED}`,
        borderRadius: 2,
        outline: 'none',
        background: '#e8ece8',
        color: '#333',
        boxSizing: 'border-box',
      }}
    />
  )
}
