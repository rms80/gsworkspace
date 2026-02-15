import { useState, useRef } from 'react'
import React from 'react'
import { CanvasItem } from '../types'
import { PROMPT_HEADER_HEIGHT, MIN_PROMPT_HEIGHT } from '../constants/canvas'

interface UsePromptEditingParams {
  items: CanvasItem[]
  onUpdateItem: (id: string, changes: Partial<CanvasItem>) => void
}

export interface PromptEditing {
  editingId: string | null
  editingField: 'label' | 'text' | null
  labelInputRef: React.RefObject<HTMLInputElement>
  textareaRef: React.RefObject<HTMLTextAreaElement>
  handleLabelDblClick: (id: string) => void
  handleTextDblClick: (id: string) => void
  handleLabelBlur: () => void
  handleTextBlur: () => void
  handleKeyDown: (e: React.KeyboardEvent) => void
  getEditingItem: () => CanvasItem | null
}

export function usePromptEditing(
  { items, onUpdateItem }: UsePromptEditingParams,
  itemType: CanvasItem['type'],
): PromptEditing {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'label' | 'text' | null>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleLabelDblClick = (id: string) => {
    setEditingId(id)
    setEditingField('label')
    setTimeout(() => {
      labelInputRef.current?.focus()
      labelInputRef.current?.select()
    }, 0)
  }

  const handleTextDblClick = (id: string) => {
    setEditingId(id)
    setEditingField('text')
    setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }, 0)
  }

  const handleLabelBlur = () => {
    if (editingId && labelInputRef.current) {
      onUpdateItem(editingId, { label: labelInputRef.current.value })
    }
    setEditingId(null)
    setEditingField(null)
  }

  const handleTextBlur = () => {
    if (editingId && textareaRef.current) {
      const newText = textareaRef.current.value
      const item = items.find((i) => i.id === editingId)

      if (item && 'width' in item && 'fontSize' in item && 'height' in item) {
        const { width, fontSize, height: currentHeight } = item as { width: number; fontSize: number; height: number }
        const textWidth = width - 16

        // Measure needed text height using offscreen element
        const measurer = document.createElement('div')
        measurer.style.position = 'absolute'
        measurer.style.visibility = 'hidden'
        measurer.style.width = textWidth + 'px'
        measurer.style.fontSize = fontSize + 'px'
        measurer.style.fontFamily = 'Arial'
        measurer.style.lineHeight = '1'
        measurer.style.whiteSpace = 'pre-wrap'
        measurer.style.wordBreak = 'break-word'
        measurer.textContent = newText
        document.body.appendChild(measurer)
        const textHeight = measurer.scrollHeight
        document.body.removeChild(measurer)

        const neededHeight = Math.max(MIN_PROMPT_HEIGHT, textHeight + PROMPT_HEADER_HEIGHT + 20)

        if (neededHeight !== currentHeight) {
          onUpdateItem(editingId, { text: newText, height: neededHeight } as Partial<CanvasItem>)
        } else {
          onUpdateItem(editingId, { text: newText })
        }
      } else {
        onUpdateItem(editingId, { text: newText })
      }
    }
    setEditingId(null)
    setEditingField(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Enter commits
      e.preventDefault()
      if (editingField === 'label') {
        handleLabelBlur()
      } else if (editingField === 'text') {
        handleTextBlur()
      }
    } else if (e.key === 'Escape') {
      setEditingId(null)
      setEditingField(null)
    }
  }

  const getEditingItem = () => {
    if (!editingId) return null
    const item = items.find((i) => i.id === editingId)
    if (!item || item.type !== itemType) return null
    return item
  }

  return {
    editingId,
    editingField,
    labelInputRef,
    textareaRef,
    handleLabelDblClick,
    handleTextDblClick,
    handleLabelBlur,
    handleTextBlur,
    handleKeyDown,
    getEditingItem,
  }
}
