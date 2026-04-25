import { useCallback, useRef } from 'react'
import { SplatItem } from '../../../types'
import { SPLAT_HEADER_HEIGHT, Z_IFRAME_OVERLAY } from '../../../constants/canvas'
import SplatViewport from './SplatViewport'

interface SplatOverlayProps {
  item: SplatItem
  stageScale: number
  stagePos: { x: number; y: number }
  isSelected: boolean
  isAnyDragActive: boolean
  transform?: { x: number; y: number; width: number; height: number }
  resetKey?: number
  onUpdateItem: (id: string, changes: Partial<SplatItem>) => void
  onContextMenu?: (e: React.MouseEvent, id: string) => void
}

export default function SplatOverlay({
  item,
  stageScale,
  stagePos,
  isSelected,
  isAnyDragActive,
  transform,
  resetKey,
  onUpdateItem,
  onContextMenu,
}: SplatOverlayProps) {
  const x = transform?.x ?? item.x
  const y = transform?.y ?? item.y
  const width = transform?.width ?? item.width
  const height = transform?.height ?? item.height
  const isDragging = !!transform
  const isInteractive = isSelected && !isAnyDragActive && !isDragging

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const isOrtho = item.orthographic ?? false
  const handleToggleOrtho = useCallback(() => {
    onUpdateItem(item.id, { orthographic: !(item.orthographic ?? false) })
  }, [item.id, item.orthographic, onUpdateItem])

  const handleCameraChange = useCallback((position: [number, number, number], target: [number, number, number], up: [number, number, number]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onUpdateItem(item.id, { cameraPosition: position, cameraTarget: target, cameraUp: up })
    }, 1000)
  }, [item.id, onUpdateItem])

  return (
    <div
      key={`splat-${item.id}`}
      data-exclusive-middle-mouse={isInteractive ? 'true' : undefined}
      style={{
        position: 'absolute',
        top: (y + SPLAT_HEADER_HEIGHT) * stageScale + stagePos.y,
        left: x * stageScale + stagePos.x,
        width: width * stageScale,
        height: height * stageScale,
        overflow: 'hidden',
        borderRadius: '0 0 4px 4px',
        zIndex: Z_IFRAME_OVERLAY,
        pointerEvents: isInteractive ? 'auto' : 'none',
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        if (onContextMenu) onContextMenu(e, item.id)
      }}
    >
      <SplatViewport
        src={item.src}
        format={item.format}
        width={width * stageScale}
        height={height * stageScale}
        isInteractive={isInteractive}
        isOrtho={isOrtho}
        onToggleOrtho={handleToggleOrtho}
        cameraPosition={item.cameraPosition}
        cameraTarget={item.cameraTarget}
        cameraUp={item.cameraUp}
        resetKey={resetKey}
        onCameraChange={handleCameraChange}
      />
    </div>
  )
}
