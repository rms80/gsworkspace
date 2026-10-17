import { v4 as uuidv4 } from 'uuid'
import { ImageItem } from '../types'
import { getContentData } from '../api/scenes'
import { bakeImageCrop, resizeImage, uploadImage } from '../api/images'
import { getCroppedImageDataUrl } from './imageCrop'

/**
 * "Baking" operations replace an image item's pixels (e.g. applying its crop, or resizing it)
 * and return a replacement item with a new id that is shown at the same place on the canvas.
 *
 * Image files are stored per item id, so the baked pixels go to a new item id and the original
 * file stays intact for undo. Server images are processed on the server (keeps GIF animation);
 * data/blob URLs and offline mode are processed in the browser (PNG output).
 */

const isLocalSrc = (src: string) => src.startsWith('data:') || src.startsWith('blob:')

const dataUrlByteSize = (dataUrl: string) => Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 3 / 4)

/** Preload so the swap doesn't flash an empty frame while the new image loads */
function preload(src: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = src
  })
}

/** Stores browser-processed pixels: uploaded to the new item id when online, kept inline offline */
async function storeDataUrl(dataUrl: string, sceneId: string, newId: string, isOffline: boolean): Promise<string> {
  return isOffline ? dataUrl : uploadImage(dataUrl, sceneId, newId, `${newId}.png`)
}

/** Bakes an image's crop: the replacement shows the cropped pixels and has no crop. */
export async function bakeCrop(item: ImageItem, sceneId: string, isOffline: boolean): Promise<ImageItem> {
  if (!item.cropRect) throw new Error('Image has no crop to bake')
  const cropRect = item.cropRect
  const newId = uuidv4()

  let src: string
  let fileSize: number | undefined
  if (isOffline || isLocalSrc(item.src)) {
    const dataUrl = await getCroppedImageDataUrl(sceneId, item.id, item.src, cropRect)
    fileSize = dataUrlByteSize(dataUrl)
    src = await storeDataUrl(dataUrl, sceneId, newId, isOffline)
  } else {
    const result = await bakeImageCrop(sceneId, item.id, newId, cropRect)
    src = result.url
    fileSize = result.fileSize
  }
  await preload(src)

  const { cropRect: _cropRect, cropSrc: _cropSrc, cropSrcFileSize: _cropSrcFileSize, ...rest } = item
  return {
    ...rest,
    id: newId,
    src,
    originalWidth: Math.round(cropRect.width),
    originalHeight: Math.round(cropRect.height),
    fileSize,
  }
}

/**
 * Bakes a resize: the replacement's pixels are exactly width×height, displayed at the same
 * size on the canvas. Only valid for images without a crop.
 */
export async function bakeResize(
  item: ImageItem,
  sceneId: string,
  isOffline: boolean,
  width: number,
  height: number,
  nearest: boolean
): Promise<ImageItem> {
  if (item.cropRect) throw new Error('Cannot resize a cropped image')
  const newId = uuidv4()

  let src: string
  let fileSize: number | undefined
  if (isOffline || isLocalSrc(item.src)) {
    const dataUrl = await resizeInBrowser(sceneId, item, width, height, nearest)
    fileSize = dataUrlByteSize(dataUrl)
    src = await storeDataUrl(dataUrl, sceneId, newId, isOffline)
  } else {
    const result = await resizeImage(sceneId, item.id, newId, width, height, nearest)
    src = result.url
    fileSize = result.fileSize
  }
  await preload(src)

  return {
    ...item,
    id: newId,
    src,
    originalWidth: width,
    originalHeight: height,
    fileSize,
  }
}

/** Resizes an image with a canvas. Smooth resizing halves in steps first for better downscaling. */
async function resizeInBrowser(sceneId: string, item: ImageItem, width: number, height: number, nearest: boolean): Promise<string> {
  // S3 images are loaded via the getContentData API to avoid CORS canvas taint
  const blobUrl = isLocalSrc(item.src)
    ? null
    : URL.createObjectURL(await getContentData(sceneId, item.id, 'image', false))
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image for resizing'))
      img.src = blobUrl ?? item.src
    })

    let source: CanvasImageSource = img
    let sw = img.naturalWidth
    let sh = img.naturalHeight
    if (!nearest) {
      while (sw / 2 >= width && sh / 2 >= height) {
        const step = document.createElement('canvas')
        step.width = Math.round(sw / 2)
        step.height = Math.round(sh / 2)
        const sctx = step.getContext('2d')
        if (!sctx) throw new Error('Failed to get canvas context')
        sctx.imageSmoothingQuality = 'high'
        sctx.drawImage(source, 0, 0, step.width, step.height)
        source = step
        sw = step.width
        sh = step.height
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get canvas context')
    ctx.imageSmoothingEnabled = !nearest
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source, 0, 0, width, height)
    return canvas.toDataURL('image/png')
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  }
}
