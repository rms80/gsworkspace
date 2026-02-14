import { useState, useRef, useEffect, RefObject, MutableRefObject } from 'react'
import Konva from 'konva'
import { config } from '../config'

export interface CanvasViewport {
  stageSize: { width: number; height: number }
  stagePos: { x: number; y: number }
  stageScale: number
  isViewportTransforming: boolean
  isMiddleMousePanning: boolean
  isAnyDragActive: boolean
  rightMouseDidDragRef: MutableRefObject<boolean>
  setStagePos: (pos: { x: number; y: number }) => void
  setStageScale: (scale: number) => void
  setIsAnyDragActive: (v: boolean) => void
  setIsViewportTransforming: (v: boolean) => void
  handleWheel: (e: Konva.KonvaEventObject<WheelEvent>) => void
  screenToCanvas: (screenX: number, screenY: number) => { x: number; y: number }
  scaleImageToViewport: (imgWidth: number, imgHeight: number) => { width: number; height: number }
}

export function useCanvasViewport(
  containerRef: RefObject<HTMLDivElement | null>,
  stageRef: RefObject<Konva.Stage | null>,
): CanvasViewport {
  const [stageSize, setStageSize] = useState({ width: 800, height: 600 })
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 })
  const [stageScale, setStageScale] = useState(1)
  const [isMiddleMousePanning, setIsMiddleMousePanning] = useState(false)
  const [isViewportTransforming, setIsViewportTransforming] = useState(false)
  const [isAnyDragActive, setIsAnyDragActive] = useState(false)
  const panStartRef = useRef({ x: 0, y: 0, stageX: 0, stageY: 0 })
  const panButtonRef = useRef<number>(-1)
  const rightMouseDidDragRef = useRef(false)
  const zoomTimeoutRef = useRef<number | null>(null)
  const DRAG_THRESHOLD = 5

  // Handle container resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setStageSize({ width: rect.width, height: rect.height })
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)

    const resizeObserver = new ResizeObserver(updateSize)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('resize', updateSize)
      resizeObserver.disconnect()
    }
  }, [])

  // Middle-mouse and right-mouse panning
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePanMouseDown = (e: MouseEvent) => {
      // Button 1 = middle, button 2 = right
      if (e.button !== 1 && e.button !== 2) return
      if (e.button === 1) {
        e.preventDefault()
        e.stopPropagation()
      }
      setIsMiddleMousePanning(true)
      setIsAnyDragActive(true)
      panButtonRef.current = e.button
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        stageX: stagePos.x,
        stageY: stagePos.y,
      }
      if (e.button === 2) {
        rightMouseDidDragRef.current = false
      }
      if (config.features.hideHtmlDuringTransform) {
        setIsViewportTransforming(true)
      }
    }

    const handlePanMouseMove = (e: MouseEvent) => {
      if (!isMiddleMousePanning) return
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y

      // For right-mouse, require a minimum drag distance before panning
      if (panButtonRef.current === 2 && !rightMouseDidDragRef.current) {
        if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
        rightMouseDidDragRef.current = true
      }

      setStagePos({
        x: panStartRef.current.stageX + dx,
        y: panStartRef.current.stageY + dy,
      })
    }

    const handlePanMouseUp = (e: MouseEvent) => {
      if (e.button !== 1 && e.button !== 2) return
      if (!isMiddleMousePanning) return
      if (e.button !== panButtonRef.current) return
      setIsMiddleMousePanning(false)
      setIsAnyDragActive(false)
      panButtonRef.current = -1
      if (config.features.hideHtmlDuringTransform) {
        setIsViewportTransforming(false)
      }
    }

    // Always suppress native context menu on the canvas container
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    container.addEventListener('mousedown', handlePanMouseDown, { capture: true })
    container.addEventListener('contextmenu', handleContextMenu)
    document.addEventListener('mousemove', handlePanMouseMove)
    document.addEventListener('mouseup', handlePanMouseUp)

    return () => {
      container.removeEventListener('mousedown', handlePanMouseDown, { capture: true })
      container.removeEventListener('contextmenu', handleContextMenu)
      document.removeEventListener('mousemove', handlePanMouseMove)
      document.removeEventListener('mouseup', handlePanMouseUp)
    }
  }, [isMiddleMousePanning, stagePos.x, stagePos.y])

  const screenToCanvas = (screenX: number, screenY: number) => {
    return {
      x: (screenX - stagePos.x) / stageScale,
      y: (screenY - stagePos.y) / stageScale,
    }
  }

  const scaleImageToViewport = (imgWidth: number, imgHeight: number) => {
    const maxWidth = stageSize.width * 0.2
    const maxHeight = stageSize.height * 0.2
    const widthRatio = maxWidth / imgWidth
    const heightRatio = maxHeight / imgHeight
    const scale = Math.min(widthRatio, heightRatio, 1)
    return {
      width: Math.round(imgWidth * scale),
      height: Math.round(imgHeight * scale),
    }
  }

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault()
    const stage = stageRef.current
    if (!stage) return

    const oldScale = stageScale
    const pointer = stage.getPointerPosition()
    if (!pointer) return

    const mousePointTo = {
      x: (pointer.x - stagePos.x) / oldScale,
      y: (pointer.y - stagePos.y) / oldScale,
    }

    const direction = e.evt.deltaY > 0 ? -1 : 1
    const newScale = direction > 0 ? oldScale * 1.1 : oldScale / 1.1
    const clampedScale = Math.max(0.1, Math.min(5, newScale))

    if (config.features.hideHtmlDuringTransform) {
      setIsViewportTransforming(true)
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current)
      }
      zoomTimeoutRef.current = window.setTimeout(() => {
        setIsViewportTransforming(false)
      }, config.timing.zoomEndDelay)
    }

    setStageScale(clampedScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    })
  }

  return {
    stageSize,
    stagePos,
    stageScale,
    isViewportTransforming,
    isMiddleMousePanning,
    isAnyDragActive,
    rightMouseDidDragRef,
    setStagePos,
    setStageScale,
    setIsAnyDragActive,
    setIsViewportTransforming,
    handleWheel,
    screenToCanvas,
    scaleImageToViewport,
  }
}
