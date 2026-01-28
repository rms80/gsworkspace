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
        top: (item.y + 8) * stageScale + stagePos.y,
        left: (item.x + 8) * stageScale + stagePos.x,
        width: item.width * stageScale,
        minHeight: textHeight * stageScale,
        fontSize: item.fontSize * stageScale,
        fontFamily: 'sans-serif',
        padding: 0,
        margin: 0,
        border: '1px solid #ccc',
        borderRadius: 4,
        outline: 'none',
        resize: 'none',
        overflow: 'hidden',
        background: 'white',
        transformOrigin: 'top left',
      }}
    />
  )
}
