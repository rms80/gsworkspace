import { useEffect, useRef } from 'react'

/**
 * Keyboard/clipboard handling for a modal tool: while active, Escape calls onCancel, and other key
 * and clipboard events are kept from the app's shortcuts (window capture phase, before the document
 * listeners) unless they come from the tool's own UI, marked with data-modal-panel="true".
 */
export function useModalCapture(active: boolean, onCancel: () => void) {
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    if (!active) return
    const fromPanel = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.('[data-modal-panel="true"]')
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onCancelRef.current()
        return
      }
      if (!fromPanel(e)) e.stopImmediatePropagation()
    }
    const blockClipboard = (e: ClipboardEvent) => {
      if (!fromPanel(e)) e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('copy', blockClipboard, true)
    window.addEventListener('cut', blockClipboard, true)
    window.addEventListener('paste', blockClipboard, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('copy', blockClipboard, true)
      window.removeEventListener('cut', blockClipboard, true)
      window.removeEventListener('paste', blockClipboard, true)
    }
  }, [active])
}
