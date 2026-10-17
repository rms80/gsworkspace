import { CanvasItem, CropRect, ImageItem } from '../../../types'
import { MultiCropMode } from '../../../hooks/useMultiCropMode'
import ImageCropOverlay from './ImageCropOverlay'
import ProcessingOverlay from './ProcessingOverlay'

interface MultiCropOverlayProps {
  multiCrop: MultiCropMode
  items: CanvasItem[]
  loadedImages: Map<string, HTMLImageElement>
  stageScale: number
  stagePos: { x: number; y: number }
}

const offsetRect = (r: CropRect, dx: number, dy: number): CropRect => ({ ...r, x: r.x + dx, y: r.y + dy })

/**
 * MultiCrop UI: one crop overlay per selected image, all sharing a single crop rect that is
 * mapped into each image through its alignment shift. The first image has the full crop
 * controls; the others have a slider to overlay the first image for checking alignment.
 */
export default function MultiCropOverlay({ multiCrop, items, loadedImages, stageScale, stagePos }: MultiCropOverlayProps) {
  const { session, cropRect } = multiCrop
  if (!session) return null

  const imageItems = session.ids.map((id) => items.find((i) => i.id === id && i.type === 'image') as ImageItem | undefined)

  if (session.status === 'aligning' || !cropRect) {
    return (
      <>
        {imageItems.map((item) => item && (
          <ProcessingOverlay
            key={`multicrop-${item.id}`}
            x={item.x}
            y={item.y}
            width={item.width * (item.scaleX ?? 1)}
            height={item.height * (item.scaleY ?? 1)}
            stageScale={stageScale}
            stagePos={stagePos}
            message={session.progress || 'Aligning...'}
          />
        ))}
      </>
    )
  }

  const refItem = imageItems[0]
  const refImage = refItem ? loadedImages.get(refItem.src) : undefined
  const count = session.ids.length

  return (
    <>
      {imageItems.map((item, i) => {
        if (!item) return null
        const img = loadedImages.get(item.src)
        if (!img) return null
        const { dx, dy } = session.shifts[i]
        const isRef = i === 0
        const opacity = multiCrop.ghostOpacity[item.id] ?? 0
        const failed = session.failedIds.includes(item.id)

        return (
          <ImageCropOverlay
            key={`multicrop-${item.id}`}
            item={item}
            image={img}
            cropRect={offsetRect(cropRect, dx, dy)}
            bounds={offsetRect(session.bounds, dx, dy)}
            stageScale={stageScale}
            stagePos={stagePos}
            lockAspectRatio={multiCrop.lockAspectRatio}
            aspectRatio={multiCrop.aspectRatio}
            onAspectRatioChange={multiCrop.setAspectRatio}
            onCropChange={(r) => multiCrop.setCropRect(offsetRect(r, -dx, -dy))}
            onLockAspectRatioChange={multiCrop.setLockAspectRatio}
            enableHotkeys={isRef}
            instructions={`MultiCrop (${count} images) - Enter to apply, Escape to cancel`}
            ghost={!isRef && refItem && refImage ? {
              src: refItem.src,
              x: dx,
              y: dy,
              width: refImage.naturalWidth,
              height: refImage.naturalHeight,
              opacity,
            } : undefined}
            controls={isRef ? undefined : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>First image overlay:</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(opacity * 100)}
                    onChange={(e) => multiCrop.setGhostOpacity(item.id, Number(e.target.value) / 100)}
                    style={{ width: 120 }}
                  />
                  <span style={{ width: 32, textAlign: 'right' }}>{Math.round(opacity * 100)}%</span>
                </div>
                <div style={{ textAlign: 'center', opacity: 0.8, color: failed ? '#ffb347' : undefined }}>
                  {failed
                    ? `Image ${i + 1} of ${count} - could not align, using top-left`
                    : `Image ${i + 1} of ${count} - offset ${dx}, ${dy}`}
                </div>
              </>
            )}
          />
        )
      })}
    </>
  )
}
