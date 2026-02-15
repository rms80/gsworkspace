import { useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { uploadImage } from '../api/images'
import { uploadPdf, uploadPdfThumbnail } from '../api/pdfs'
import { uploadTextFile } from '../api/textfiles'
import { renderPdfPageToDataUrl } from '../utils/pdfThumbnail'
import { isVideoFile } from '../api/videos'
import { PDF_MINIMIZED_HEIGHT, getTextFileFormat, TEXT_FILE_EXTENSION_PATTERN } from '../constants/canvas'
import { ACTIVE_WORKSPACE } from '../api/workspace'

interface FileDropContext {
  activeSceneId: string | null
  isOffline: boolean
  startOperation: () => void
  endOperation: () => void
  addImageAt: (id: string, x: number, y: number, src: string, w: number, h: number, name?: string, ow?: number, oh?: number, fileSize?: number) => void
  handleUploadVideoAt: (file: File, x: number, y: number) => void
  addPdfAt: (id: string, x: number, y: number, src: string, w: number, h: number, name?: string, fileSize?: number, thumbnailSrc?: string) => void
  addTextFileAt: (id: string, x: number, y: number, src: string, w: number, h: number, name?: string, fileSize?: number, fileFormat?: string) => void
}

export function useFileDrop({
  activeSceneId, isOffline, startOperation, endOperation,
  addImageAt, handleUploadVideoAt, addPdfAt, addTextFileAt,
}: FileDropContext) {
  const pendingDropFilesRef = useRef<File[]>([])

  // Process pending drop files when a scene becomes active
  useEffect(() => {
    if (!activeSceneId || pendingDropFilesRef.current.length === 0) return

    const files = pendingDropFilesRef.current
    pendingDropFilesRef.current = []

    // Process each file
    const processFiles = async () => {
      let offsetIndex = 0
      const centerX = 400
      const centerY = 300

      for (const file of files) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader()
          const fileName = file.name
          const fileSize = file.size

          reader.onload = async (event) => {
            const dataUrl = event.target?.result as string
            const img = new window.Image()
            img.onload = async () => {
              // Scale down large images
              const maxDim = 800
              let width = img.width
              let height = img.height
              if (width > maxDim || height > maxDim) {
                const scale = maxDim / Math.max(width, height)
                width = Math.round(width * scale)
                height = Math.round(height * scale)
              }
              const name = fileName.replace(/\.[^/.]+$/, '')
              const originalWidth = img.naturalWidth
              const originalHeight = img.naturalHeight

              // Generate item ID upfront so it matches the uploaded file
              const itemId = uuidv4()

              try {
                startOperation()
                const s3Url = await uploadImage(dataUrl, activeSceneId!, itemId, fileName || `dropped-${Date.now()}.png`)
                endOperation()
                addImageAt(itemId, centerX + offsetIndex * 20, centerY + offsetIndex * 20, s3Url, width, height, name, originalWidth, originalHeight, fileSize)
              } catch (err) {
                endOperation()
                console.error('Failed to upload image:', err)
                addImageAt(itemId, centerX + offsetIndex * 20, centerY + offsetIndex * 20, dataUrl, width, height, name, originalWidth, originalHeight, fileSize)
              }
            }
            img.src = dataUrl
          }
          reader.readAsDataURL(file)
          offsetIndex++
        } else if (isVideoFile(file)) {
          // Delegate to handleUploadVideoAt which handles placeholders
          handleUploadVideoAt(file, centerX + offsetIndex * 20, centerY + offsetIndex * 20)
          offsetIndex++
        } else if (file.type === 'application/pdf') {
          const reader = new FileReader()
          const fileName = file.name
          const fileSize = file.size
          reader.onload = async (event) => {
            const dataUrl = event.target?.result as string
            const name = fileName.replace(/\.[^/.]+$/, '')
            const itemId = uuidv4()
            try {
              startOperation()
              const s3Url = await uploadPdf(dataUrl, activeSceneId!, itemId, fileName || `document-${Date.now()}.pdf`)
              let thumbnailSrc: string | undefined
              try {
                const proxyUrl = `/api/w/${ACTIVE_WORKSPACE}/scenes/${activeSceneId}/content-data?contentId=${itemId}&contentType=pdf`
                const thumb = await renderPdfPageToDataUrl(proxyUrl, 1, PDF_MINIMIZED_HEIGHT * 4)
                thumbnailSrc = await uploadPdfThumbnail(thumb.dataUrl, activeSceneId!, itemId)
              } catch (thumbErr) {
                console.error('Failed to generate/upload PDF thumbnail:', thumbErr)
              }
              endOperation()
              addPdfAt(itemId, centerX + offsetIndex * 20, centerY + offsetIndex * 20, s3Url, 600, 700, name, fileSize, thumbnailSrc)
            } catch (err) {
              endOperation()
              console.error('Failed to upload PDF:', err)
              addPdfAt(itemId, centerX + offsetIndex * 20, centerY + offsetIndex * 20, dataUrl, 600, 700, name, fileSize)
            }
          }
          reader.readAsDataURL(file)
          offsetIndex++
        } else if (file.type === 'text/plain' || file.type === 'text/csv' || TEXT_FILE_EXTENSION_PATTERN.test(file.name)) {
          const reader = new FileReader()
          const fileName = file.name
          const fileSize = file.size
          const fileFormat = getTextFileFormat(fileName) || 'txt'
          reader.onload = async (event) => {
            const dataUrl = event.target?.result as string
            const name = fileName
            const itemId = uuidv4()
            try {
              startOperation()
              const s3Url = await uploadTextFile(dataUrl, activeSceneId!, itemId, fileName || `document-${Date.now()}.${fileFormat}`, fileFormat)
              endOperation()
              addTextFileAt(itemId, centerX + offsetIndex * 20, centerY + offsetIndex * 20, s3Url, 600, 500, name, fileSize, fileFormat)
            } catch (err) {
              endOperation()
              console.error('Failed to upload text file:', err)
              addTextFileAt(itemId, centerX + offsetIndex * 20, centerY + offsetIndex * 20, dataUrl, 600, 500, name, fileSize, fileFormat)
            }
          }
          reader.readAsDataURL(file)
          offsetIndex++
        }
      }
    }

    processFiles()
  }, [activeSceneId, isOffline, startOperation, endOperation, addImageAt, handleUploadVideoAt, addPdfAt, addTextFileAt])

  const handleEmptyStateDrop = useCallback((e: React.DragEvent, addScene: () => Promise<void>) => {
    e.preventDefault()
    const files = Array.from(e.dataTransfer.files)
    const mediaFiles = files.filter(f => f.type.startsWith('image/') || isVideoFile(f))
    if (mediaFiles.length === 0) return

    // Store files and create a new scene
    pendingDropFilesRef.current = mediaFiles
    addScene()
  }, [])

  return { handleEmptyStateDrop }
}
