import { useState, useRef } from 'react'
import React from 'react'
import { CanvasItem } from '../types'

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
      onUpdateItem(editingId, { text: textareaRef.current.value })
    }
    setEditingId(null)
    setEditingField(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
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
