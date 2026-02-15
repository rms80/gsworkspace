import { useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { uploadImage } from '../api/images'
import { uploadVideo, getVideoDimensionsSafe, getVideoDimensionsFromUrl } from '../api/videos'
import { uploadPdf, uploadPdfThumbnail } from '../api/pdfs'
import { uploadTextFile } from '../api/textfiles'
import { renderPdfPageToDataUrl } from '../utils/pdfThumbnail'
import { PDF_MINIMIZED_HEIGHT, getTextFileFormat } from '../constants/canvas'
import { ACTIVE_WORKSPACE } from '../api/workspace'

export type VideoPlaceholder = {
  id: string
  x: number
  y: number
  width: number
  height: number
  name: string
}

interface UseItemUploadDeps {
  activeSceneId: string | null
  isOffline: boolean
  startOperation: () => void
  endOperation: () => void
  addImageItem: (id: string, src: string, width: number, height: number) => void
  addVideoItem: (id: string, src: string, width: number, height: number, name?: string, fileSize?: number) => void
  addVideoAt: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, fileSize?: number, originalWidth?: number, originalHeight?: number) => void
  addPdfAt: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, fileSize?: number, thumbnailSrc?: string) => void
  addTextFileAt: (id: string, x: number, y: number, src: string, width: number, height: number, name?: string, fileSize?: number, fileFormat?: string) => void
}

export function useItemUpload(deps: UseItemUploadDeps) {
  const {
    activeSceneId, isOffline, startOperation, endOperation,
    addImageItem, addVideoItem, addVideoAt, addPdfAt, addTextFileAt,
  } = deps

  const [videoPlaceholders, setVideoPlaceholders] = useState<VideoPlaceholder[]>([])

  const handleAddImage = useCallback(async (file: File) => {
    if (!activeSceneId) return

    // Generate item ID upfront so it matches the uploaded file
    const itemId = uuidv4()

    // Read file as data URL to get dimensions and upload
    const reader = new FileReader()
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string
      const img = new Image()
      img.onload = async () => {
        try {
          startOperation()
          const s3Url = await uploadImage(dataUrl, activeSceneId, itemId, file.name || 'image.png')
          endOperation()
          addImageItem(itemId, s3Url, img.width, img.height)
        } catch (err) {
          endOperation()
          console.error('Failed to upload image:', err)
          // Fall back to data URL
          addImageItem(itemId, dataUrl, img.width, img.height)
        }
      }
      img.src = dataUrl
    }
    reader.readAsDataURL(file)
  }, [activeSceneId, addImageItem, startOperation, endOperation])

  const handleAddVideo = useCallback(async (file: File) => {
    try {
      // Try to get dimensions client-side (fails for non-browser-native formats like MKV)
      let dimensions = await getVideoDimensionsSafe(file)

      if (!dimensions && isOffline) {
        alert('This video format is not supported in offline mode. Please use MP4 or WebM.')
        return
      }

      // Generate item ID upfront so it matches the uploaded file
      const itemId = uuidv4()

      // Show placeholder while uploading (assume 1920x1280, scaled to 640x427)
      const placeholderW = 640
      const placeholderH = 427
      const placeholderX = 100 + Math.random() * 200
      const placeholderY = 100 + Math.random() * 200
      const placeholderName = file.name.replace(/\.[^/.]+$/, '')
      setVideoPlaceholders(prev => [...prev, { id: itemId, x: placeholderX, y: placeholderY, width: placeholderW, height: placeholderH, name: placeholderName }])

      startOperation()
      try {
        const result = await uploadVideo(file, activeSceneId!, itemId, isOffline)
        endOperation()

        // If client-side dims failed (e.g. MKV), get them from the transcoded URL
        if (!dimensions) {
          const urlDims = await getVideoDimensionsFromUrl(result.url)
          dimensions = { ...urlDims, fileSize: file.size }
        }

        const name = file.name.replace(/\.[^/.]+$/, '')
        addVideoItem(itemId, result.url, dimensions.width, dimensions.height, name, dimensions.fileSize)
      } catch (error) {
        endOperation()
        console.error('Failed to add video:', error)
        alert('Failed to add video. Please try again.')
      } finally {
        setVideoPlaceholders(prev => prev.filter(p => p.id !== itemId))
      }
    } catch (error) {
      console.error('Failed to add video:', error)
      alert('Failed to add video. Please try again.')
    }
  }, [isOffline, activeSceneId, addVideoItem, startOperation, endOperation])

  const handleAddTextFile = useCallback(async (file: File) => {
    if (!activeSceneId) return

    const itemId = uuidv4()
    const reader = new FileReader()
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string
      const name = file.name
      const fileSize = file.size
      const fileFormat = getTextFileFormat(file.name) || 'txt'
      try {
        startOperation()
        const s3Url = await uploadTextFile(dataUrl, activeSceneId, itemId, file.name || `document-${Date.now()}.${fileFormat}`, fileFormat)
        endOperation()
        addTextFileAt(itemId, 400 + Math.random() * 200, 300 + Math.random() * 200, s3Url, 600, 500, name, fileSize, fileFormat)
      } catch (err) {
        endOperation()
        console.error('Failed to upload text file:', err)
        addTextFileAt(itemId, 400 + Math.random() * 200, 300 + Math.random() * 200, dataUrl, 600, 500, name, fileSize, fileFormat)
      }
    }
    reader.readAsDataURL(file)
  }, [activeSceneId, addTextFileAt, startOperation, endOperation])

  const handleAddPdf = useCallback(async (file: File) => {
    if (!activeSceneId) return

    const itemId = uuidv4()
    const reader = new FileReader()
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string
      const name = file.name.replace(/\.[^/.]+$/, '')
      const fileSize = file.size
      try {
        startOperation()
        const s3Url = await uploadPdf(dataUrl, activeSceneId, itemId, file.name || 'document.pdf')
        // Generate and upload thumbnail via content-data proxy (avoids CORS with S3)
        let thumbnailSrc: string | undefined
        try {
          const proxyUrl = `/api/w/${ACTIVE_WORKSPACE}/scenes/${activeSceneId}/content-data?contentId=${itemId}&contentType=pdf`
          const thumb = await renderPdfPageToDataUrl(proxyUrl, 1, PDF_MINIMIZED_HEIGHT * 4)
          thumbnailSrc = await uploadPdfThumbnail(thumb.dataUrl, activeSceneId, itemId)
        } catch (thumbErr) {
          console.error('Failed to generate/upload PDF thumbnail:', thumbErr)
        }
        endOperation()
        addPdfAt(itemId, 400 + Math.random() * 200, 300 + Math.random() * 200, s3Url, 600, 700, name, fileSize, thumbnailSrc)
      } catch (err) {
        endOperation()
        console.error('Failed to upload PDF:', err)
        addPdfAt(itemId, 400 + Math.random() * 200, 300 + Math.random() * 200, dataUrl, 600, 700, name, fileSize)
      }
    }
    reader.readAsDataURL(file)
  }, [activeSceneId, addPdfAt, startOperation, endOperation])

  // Upload a video at a specific canvas position (called by InfiniteCanvas drop handler)
  const handleUploadVideoAt = useCallback(async (file: File, x: number, y: number) => {
    try {
      let dimensions = await getVideoDimensionsSafe(file)

      if (!dimensions && isOffline) {
        console.warn('Skipping unsupported video format in offline mode:', file.name)
        return
      }

      // Generate item ID upfront so it matches the uploaded file
      const itemId = uuidv4()

      // Show placeholder while uploading (assume 1920x1280, scaled to 640x427)
      const placeholderW = 640
      const placeholderH = 427
      const placeholderName = file.name.replace(/\.[^/.]+$/, '')
      setVideoPlaceholders(prev => [...prev, { id: itemId, x: x - placeholderW / 2, y, width: placeholderW, height: placeholderH, name: placeholderName }])

      startOperation()
      try {
        const result = await uploadVideo(file, activeSceneId!, itemId, isOffline)
        endOperation()

        if (!dimensions) {
          const urlDims = await getVideoDimensionsFromUrl(result.url)
          dimensions = { ...urlDims, fileSize: file.size }
        }

        const name = file.name.replace(/\.[^/.]+$/, '')
        addVideoAt(itemId, x, y, result.url, dimensions.width, dimensions.height, name, dimensions.fileSize)
      } catch (err) {
        console.error('Video upload failed:', file.name, err)
        endOperation()
      } finally {
        setVideoPlaceholders(prev => prev.filter(p => p.id !== itemId))
      }
    } catch (error) {
      console.error('Failed to process video:', error)
    }
  }, [isOffline, activeSceneId, addVideoAt, startOperation, endOperation])

  return {
    videoPlaceholders,
    handleAddImage,
    handleAddVideo,
    handleAddPdf,
    handleAddTextFile,
    handleUploadVideoAt,
  }
}
