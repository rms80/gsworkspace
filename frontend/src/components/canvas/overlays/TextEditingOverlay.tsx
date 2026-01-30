import React from 'react'
import Konva from 'konva'
import { TextItem } from '../../../types'

interface TextEditingOverlayProps {
  item: TextItem
  textareaRef: React.RefObject<HTMLTextAreaElement>
  stageScale: number
  stagePos: { x: number; y: number }
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

export default function TextEditingOverlay({
  item,
  textareaRef,
  stageScale,
  stagePos,
  onBlur,
  onKeyDown,
}: TextEditingOverlayProps) {
  const padding = 8
  const textNode = new Konva.Text({
    text: item.text,
    fontSize: item.fontSize,
    width: item.width,
  })
  const textHeight = textNode.height()

  return (
    <textarea
      ref={textareaRef}
      defaultValue={item.text}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onInput={(e) => {
        const target = e.target as HTMLTextAreaElement
        target.style.height = 'auto'
        target.style.height = target.scrollHeight + 'px'
      }}
      style={{
        position: 'absolute',
        top: item.y * stageScale + stagePos.y,
        left: item.x * stageScale + stagePos.x,
        width: (item.width + padding * 2) * stageScale,
        minHeight: (textHeight + padding * 2) * stageScale,
        fontSize: item.fontSize * stageScale,
        fontFamily: 'sans-serif',
        padding: padding * stageScale,
        margin: 0,
        border: '1px solid #ccc',
        borderRadius: 4,
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        background: 'white',
        transformOrigin: 'top left',
        boxSizing: 'border-box',
      }}
    />
  )
}
