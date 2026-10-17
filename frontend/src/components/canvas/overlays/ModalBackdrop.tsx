import { useEffect, useRef } from 'react'

// Above the canvas and its other overlays (iframes, media, crop UIs use up to 1000)
export const Z_MODAL_BACKDROP = 2000
export const Z_MODAL_CONTENT = 2001

// Side panel of modal media tools (Create GIF / Create Video): fixed screen width and gap to the
// right of the preview (also used to frame the view when a tool opens)
export const MODAL_PANEL_WIDTH = 320
export const MODAL_PANEL_GAP = 12

/**
 * Dims the canvas and blocks interaction with it while a modal tool is open. Viewport controls
 * still work: middle/right-drag panning is handled by the canvas container's capture listener
 * before events reach here, and wheel events are forwarded to the stage for zooming.
 * Mark the tool's own UI with data-modal-panel="true" (see useModalCapture).
 */
export default function ModalBackdrop() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const forwardWheel = (ev: WheelEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      document.querySelector('.konvajs-content')?.dispatchEvent(new WheelEvent('wheel', ev))
    }
    el.addEventListener('wheel', forwardWheel, { passive: false })
    return () => el.removeEventListener('wheel', forwardWheel)
  }, [])

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        pointerEvents: 'auto',
        zIndex: Z_MODAL_BACKDROP,
      }}
      // Swallow left-button interaction (selection, marquee, clicks); other buttons pan the canvas
      onMouseDown={(e) => {
        if (e.button === 0) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    />
  )
}
