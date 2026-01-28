import { Image as KonvaImage } from 'react-konva'
import Konva from 'konva'
import { ImageItem, CropRect } from '../../../types'
import ImageCropOverlay from '../../ImageCropOverlay'
import { COLOR_SELECTED } from '../../../constants/canvas'

interface ImageItemRendererProps {
  item: ImageItem
  image: HTMLImageElement
  isSelected: boolean
  isCropping: boolean
  pendingCropRect: CropRect | null
  stageScale: number
  onItemClick: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onContextMenu: (e: Konva.KonvaEventObject<MouseEvent>, id: string) => void
  onUpdateItem: (id: string, changes: Partial<ImageItem>) => void
  onCropChange: (rect: CropRect) => void
}

export default function ImageItemRenderer({
  item,
  image,
  isSelected,
  isCropping,
  pendingCropRect,
  stageScale,
  onItemClick,
  onContextMenu,
  onUpdateItem,
  onCropChange,
}: ImageItemRendererProps) {
  if (isCropping && pendingCropRect) {
    return (
      <ImageCropOverlay
        key={`crop-${item.id}`}
        item={item}
        image={image}
        cropRect={pendingCropRect}
        stageScale={stageScale}
        onCropChange={onCropChange}
      />
    )
  }

  return (
    <KonvaImage
      key={item.id}
      id={item.id}
      x={item.x}
      y={item.y}
      image={image}
      width={item.width}
      height={item.height}
      crop={item.cropRect ? { x: item.cropRect.x, y: item.cropRect.y, width: item.cropRect.width, height: item.cropRect.height } : undefined}
      scaleX={item.scaleX ?? 1}
      scaleY={item.scaleY ?? 1}
      rotation={item.rotation ?? 0}
      draggable
      onClick={(e) => onItemClick(e, item.id)}
      onContextMenu={(e) => {
        e.evt.preventDefault()
        e.cancelBubble = true
        onContextMenu(e, item.id)
      }}
      onDragEnd={(e) => {
        onUpdateItem(item.id, { x: e.target.x(), y: e.target.y() })
      }}
      onTransformEnd={(e) => {
        const node = e.target
        onUpdateItem(item.id, {
          x: node.x(),
          y: node.y(),
          scaleX: node.scaleX(),
          scaleY: node.scaleY(),
          rotation: node.rotation(),
        })
      }}
      stroke={isSelected ? COLOR_SELECTED : undefined}
      strokeWidth={isSelected ? 2 : 0}
    />
  )
}
