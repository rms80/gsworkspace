import { useCallback, useRef } from 'react'
import { Model3DItem } from '../../../types'
import { MODEL3D_HEADER_HEIGHT } from '../../../constants/canvas'
import { Z_IFRAME_OVERLAY } from '../../../constants/canvas'
import Model3DViewport from './Model3DViewport'

interface Model3DOverlayProps {
  item: Model3DItem
  stageScale: number
  stagePos: { x: number; y: number }
  isSelected: boolean
  isAnyDragActive: boolean
  transform?: { x: number; y: number; width: number; height: number }
  resetKey?: number
  onUpdateItem: (id: string, changes: Partial<Model3DItem>) => void
  onContextMenu?: (e: React.MouseEvent, id: string) => void
}

export default function Model3DOverlay({
  item,
  stageScale,
  stagePos,
  isSelected,
  isAnyDragActive,
  transform,
  resetKey,
  onUpdateItem,
  onContextMenu,
}: Model3DOverlayProps) {
  const x = transform?.x ?? item.x
  const y = transform?.y ?? item.y
  const width = transform?.width ?? item.width
  const height = transform?.height ?? item.height
  const isDragging = !!transform
  const isInteractive = isSelected && !isAnyDragActive && !isDragging

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const handleCameraChange = useCallback((position: [number, number, number], target: [number, number, number]) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onUpdateItem(item.id, { cameraPosition: position, cameraTarget: target })
    }, 1000)
  }, [item.id, onUpdateItem])

  return (
    <div
      key={`model3d-${item.id}`}
      data-exclusive-middle-mouse={isInteractive ? 'true' : undefined}
      style={{
        position: 'absolute',
        top: (y + MODEL3D_HEADER_HEIGHT) * stageScale + stagePos.y,
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
      <Model3DViewport
        src={item.src}
        format={item.format}
        width={width * stageScale}
        height={height * stageScale}
        isInteractive={isInteractive}
        cameraPosition={item.cameraPosition}
        cameraTarget={item.cameraTarget}
        resetKey={resetKey}
        onCameraChange={handleCameraChange}
      />
    </div>
  )
}
