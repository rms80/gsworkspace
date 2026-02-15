import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CanvasItem, TextFileItem, TextFileFormat } from '../types'
import { generateFromPrompt, generateImage, generateHtml, ContentItem, generateHtmlTitle, quickLlmQuery } from '../api/llm'
import { getCroppedImageDataUrl } from '../utils/imageCrop'
import { isHtmlContent, stripCodeFences } from '../utils/htmlDetection'
import { extractCodeBlocks } from '../utils/codeBlockExtractor'
import { uploadTextFile } from '../api/textfiles'
import { generateUniqueName, getExistingTextFileNames } from '../utils/imageNames'
import DOMPurify from 'dompurify'
import { convertItemsToSpatialJson, replaceImagePlaceholders } from '../utils/spatialJson'
import { playNotificationSound } from '../utils/sound'
import { config } from '../config'
import { TEXTFILE_HEADER_HEIGHT } from '../constants/canvas'
import { snapToGrid, getGridSize } from '../utils/grid'

const TEXT_PADDING = 8

/** Estimate item height from text content, capped at maxHeight. */
function estimateTextHeight(text: string, fontSize: number, width: number, maxHeight: number): number {
  // Approximate characters per line based on width and font size
  // Average character width is roughly 0.6 * fontSize for proportional fonts
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.6)))
  let lineCount = 0
  for (const line of text.split('\n')) {
    // Each explicit line takes at least 1 visual line, plus wrapping
    lineCount += Math.max(1, Math.ceil(line.length / charsPerLine))
  }
  // Add 2 extra lines of breathing room, then cap at maxHeight
  const estimatedHeight = (lineCount + 2) * fontSize + TEXT_PADDING * 2
  return Math.min(estimatedHeight, maxHeight)
}

/** Generate a descriptive filename for an extracted code block using a quick LLM query. */
async function generateCodeFilename(content: string, format: string, _userPrompt: string): Promise<string> {
  const fallback = `code-${Date.now()}.${format}`
  try {
    const truncated = content.slice(0, 5000)
    const result = await quickLlmQuery(
      `Based on this text content, generate a short descriptive filename in PascalCase with no spaces. The file extension should be .${format}. Just output the filename (e.g. "DataParser.${format}"), nothing else.\n\nText:\n${truncated}`
    )
    const cleaned = result.trim().replace(/[^a-zA-Z0-9._-]/g, '')
    if (cleaned.length > 0 && cleaned.includes('.')) return cleaned
    // If model returned name without extension, add it
    if (cleaned.length > 0) return `${cleaned}.${format}`
    return fallback
  } catch (error) {
    console.warn('Failed to generate code filename:', error)
    return fallback
  }
}

interface PromptExecutionContext {
  items: CanvasItem[]
  selectedIds: string[]
  activeSceneId: string | null
  isOffline: boolean
  updateActiveSceneItems: (updater: (items: CanvasItem[]) => CanvasItem[]) => void
  setRunningPromptIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setRunningImageGenPromptIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setRunningHtmlGenPromptIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setDebugContent: (content: string) => void
}

export function usePromptExecution({
  items, selectedIds, activeSceneId, isOffline,
  updateActiveSceneItems, setRunningPromptIds,
  setRunningImageGenPromptIds, setRunningHtmlGenPromptIds,
  setDebugContent,
}: PromptExecutionContext) {

  const handleRunPrompt = useCallback(async (promptId: string) => {
    const promptItem = items.find((item) => item.id === promptId && item.type === 'prompt')
    if (!promptItem || promptItem.type !== 'prompt') return

    // Mark prompt as running
    setRunningPromptIds((prev) => new Set(prev).add(promptId))

    // Gather selected items (excluding the prompt itself)
    const selectedItems = items.filter((item) => selectedIds.includes(item.id) && item.id !== promptId)

    // Convert to ContentItem format for the API
    const contentItems: ContentItem[] = (await Promise.all(selectedItems.map(async (item) => {
      if (item.type === 'text') {
        return { type: 'text' as const, text: item.text }
      } else if (item.type === 'image') {
        if (isOffline) {
          // Offline mode: send src data URL directly to client-side LLM
          let src = item.src
          if (item.cropRect && activeSceneId) {
            try {
              src = await getCroppedImageDataUrl(activeSceneId, item.id, item.src, item.cropRect)
            } catch (err) {
              console.error('Failed to crop image for LLM, using original:', err)
            }
          }
          return { type: 'image' as const, src }
        }
        // Online mode: send ID so backend resolves from storage
        return { type: 'image' as const, id: item.id, sceneId: activeSceneId!, useEdited: !!item.cropRect }
      } else if (item.type === 'pdf') {
        if (isOffline) {
          // Offline mode: send src URL directly to client-side LLM
          return { type: 'pdf' as const, src: item.src }
        }
        // Online mode: send ID so backend resolves from storage
        return { type: 'pdf' as const, id: item.id, sceneId: activeSceneId! }
      } else if (item.type === 'text-file') {
        if (isOffline) {
          // Offline mode: send src URL directly to client-side LLM
          return { type: 'text-file' as const, src: item.src }
        }
        // Online mode: send ID so backend resolves from storage
        return { type: 'text-file' as const, id: item.id, sceneId: activeSceneId!, fileFormat: item.fileFormat }
      } else if (item.type === 'prompt') {
        return { type: 'text' as const, text: `[${item.label}]: ${item.text}` }
      } else if (item.type === 'html') {
        return { type: 'text' as const, text: `[HTML Content]:\n${item.html}` }
      }
      return { type: 'text' as const, text: '' }
    }))).filter((item) => item.text || item.src || item.id)

    try {
      const result = await generateFromPrompt(contentItems, promptItem.text, promptItem.model)

      // Position output to the right of the prompt, aligned with top
      // Find existing outputs to stack vertically
      const outputX = promptItem.x + promptItem.width + 20
      const existingOutputsToRight = items.filter(item =>
        item.x >= outputX - 10 &&
        item.x <= outputX + 10 &&
        item.y >= promptItem.y - 10
      )
      const outputY = existingOutputsToRight.length > 0
        ? Math.max(...existingOutputsToRight.map(item => item.y + item.height)) + 20
        : promptItem.y

      // Extract recognized code fence blocks from the result
      const { text: remainingText, codeBlocks } = extractCodeBlocks(result)

      if (codeBlocks.length > 0) {
        // Code blocks found — create items for each extracted block + TextItem for surrounding text
        const newItems: CanvasItem[] = []
        const textWidth = Math.max(promptItem.width, 300)

        // Create text item for remaining text (if any)
        if (remainingText.trim()) {
          newItems.push({
            id: uuidv4(),
            type: 'text',
            x: outputX,
            y: outputY,
            text: remainingText,
            fontSize: 14,
            width: textWidth,
            height: 200,
          })
        }

        // Position extracted items to the right of the text, or at outputX if no text
        const blockX = remainingText.trim() ? outputX + textWidth + 20 : outputX
        let blockY = outputY

        // Track existing text file names for deduplication (includes names from this batch)
        const usedNames = getExistingTextFileNames(items).map(n => n.replace(/\.[^/.]+$/, ''))

        // If an HTML item is among the selected inputs, match its dimensions/zoom for HTML blocks
        const inputHtmlItem = selectedItems.find((item) => item.type === 'html')

        for (const block of codeBlocks) {
          if (block.format === 'html') {
            // Create HtmlItem for HTML code blocks
            const htmlContent = config.features.sanitizeHtml
              ? DOMPurify.sanitize(block.content, {
                  WHOLE_DOCUMENT: true,
                  ADD_TAGS: ['style', 'link', 'meta', '#comment'],
                  FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
                })
              : block.content
            const htmlWidth = inputHtmlItem?.type === 'html' ? inputHtmlItem.width : 800
            const htmlHeight = inputHtmlItem?.type === 'html' ? inputHtmlItem.height : 300
            const htmlZoom = inputHtmlItem?.type === 'html' ? (inputHtmlItem.zoom ?? 1) : 0.75
            const title = await generateHtmlTitle(htmlContent)
            newItems.push({
              id: uuidv4(),
              type: 'html',
              label: title,
              x: blockX,
              y: blockY,
              html: htmlContent,
              width: htmlWidth,
              height: htmlHeight,
              zoom: htmlZoom,
            })
            blockY += htmlHeight + 20
          } else {
            // Create TextFileItem for all other code blocks
            const format = block.format as TextFileFormat
            const itemId = uuidv4()
            const mimeType = format === 'json' ? 'application/json' : 'text/plain'
            const dataUrl = `data:${mimeType};base64,` + btoa(unescape(encodeURIComponent(block.content)))
            const rawFilename = await generateCodeFilename(block.content, format, promptItem.text)
            const ext = `.${format}`
            const uniqueBase = generateUniqueName(rawFilename, usedNames)
            const filename = uniqueBase.endsWith(ext) ? uniqueBase : uniqueBase + ext
            usedNames.push(uniqueBase)

            // Upload to storage if online
            let src = dataUrl
            if (!isOffline && activeSceneId) {
              try {
                src = await uploadTextFile(dataUrl, activeSceneId, itemId, filename, format)
              } catch (err) {
                console.error(`Failed to upload ${format} file, using data URL:`, err)
              }
            }

            const fileHeight = estimateTextHeight(block.content, 14, 600, 400)
            const fileItem: TextFileItem = {
              id: itemId,
              type: 'text-file',
              x: blockX,
              y: blockY,
              src,
              name: filename,
              width: 600,
              height: fileHeight,
              fileSize: new Blob([block.content]).size,
              fileFormat: format,
              fontMono: true,
            }
            newItems.push(fileItem)
            // Advance past full visual height (header + content + gap), snap to grid
            const itemBottom = blockY + fileHeight + TEXTFILE_HEADER_HEIGHT + 5
            let nextY = snapToGrid(itemBottom)
            // If snapping rounded down into the item, bump up one grid step
            if (nextY < itemBottom) nextY += getGridSize()
            blockY = nextY
          }
        }

        updateActiveSceneItems((prev) => [...prev, ...newItems])
      } else if (isHtmlContent(result)) {
        // Full-response HTML fallback (no code fences, but content is HTML)
        const strippedHtml = stripCodeFences(result).trim()
        const htmlContent = config.features.sanitizeHtml
          ? DOMPurify.sanitize(strippedHtml, {
              WHOLE_DOCUMENT: true,
              ADD_TAGS: ['style', 'link', 'meta', '#comment'],
              FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
            })
          : strippedHtml
        const inputHtmlItem = selectedItems.find((item) => item.type === 'html')
        const htmlWidth = inputHtmlItem?.type === 'html' ? inputHtmlItem.width : 800
        const htmlHeight = inputHtmlItem?.type === 'html' ? inputHtmlItem.height : 300
        const htmlZoom = inputHtmlItem?.type === 'html' ? (inputHtmlItem.zoom ?? 1) : 0.75
        const title = await generateHtmlTitle(htmlContent)
        const newItem: CanvasItem = {
          id: uuidv4(),
          type: 'html',
          label: title,
          x: outputX,
          y: outputY,
          html: htmlContent,
          width: htmlWidth,
          height: htmlHeight,
          zoom: htmlZoom,
        }
        updateActiveSceneItems((prev) => [...prev, newItem])
      } else {
        // Plain text response — create a TextItem
        const newItem: CanvasItem = {
          id: uuidv4(),
          type: 'text',
          x: outputX,
          y: outputY,
          text: result,
          fontSize: 14,
          width: Math.max(promptItem.width, 300),
          height: 200,
        }
        updateActiveSceneItems((prev) => [...prev, newItem])
      }

      playNotificationSound()
    } catch (error) {
      playNotificationSound('failure')
      console.error('Failed to run prompt:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to run prompt: ${message}`)
    } finally {
      // Mark prompt as no longer running
      setRunningPromptIds((prev) => {
        const next = new Set(prev)
        next.delete(promptId)
        return next
      })
    }
  }, [items, selectedIds, updateActiveSceneItems, isOffline, activeSceneId])

  const handleRunImageGenPrompt = useCallback(async (promptId: string) => {
    const promptItem = items.find((item) => item.id === promptId && item.type === 'image-gen-prompt')
    if (!promptItem || promptItem.type !== 'image-gen-prompt') return

    // Mark prompt as running
    setRunningImageGenPromptIds((prev) => new Set(prev).add(promptId))

    // Gather selected items (excluding the prompt itself)
    const selectedItems = items.filter((item) => selectedIds.includes(item.id) && item.id !== promptId)

    // Convert to ContentItem format for the API
    const contentItems: ContentItem[] = (await Promise.all(selectedItems.map(async (item) => {
      if (item.type === 'text') {
        return { type: 'text' as const, text: item.text }
      } else if (item.type === 'image') {
        if (isOffline) {
          // Offline mode: send src data URL directly to client-side LLM
          let src = item.src
          if (item.cropRect && activeSceneId) {
            try {
              src = await getCroppedImageDataUrl(activeSceneId, item.id, item.src, item.cropRect)
            } catch (err) {
              console.error('Failed to crop image for LLM, using original:', err)
            }
          }
          return { type: 'image' as const, src }
        }
        // Online mode: send ID so backend resolves from storage
        return { type: 'image' as const, id: item.id, sceneId: activeSceneId!, useEdited: !!item.cropRect }
      } else if (item.type === 'prompt' || item.type === 'image-gen-prompt') {
        return { type: 'text' as const, text: `[${item.label}]: ${item.text}` }
      }
      return { type: 'text' as const, text: '' }
    }))).filter((item) => item.text || item.src || item.id)

    try {
      const images = await generateImage(contentItems, promptItem.text, promptItem.model)

      // Position outputs to the right of the prompt, stacked vertically
      const outputX = promptItem.x + promptItem.width + 20

      // Find existing outputs to the right to stack below them
      const existingOutputsToRight = items.filter(item =>
        item.x >= outputX - 10 &&
        item.x <= outputX + 10 &&
        item.y >= promptItem.y - 10
      )
      const startY = existingOutputsToRight.length > 0
        ? Math.max(...existingOutputsToRight.map(item => item.y + item.height)) + 20
        : promptItem.y

      // Create new image items for each generated image
      // Load each image to get its actual dimensions, then stack vertically
      let currentY = startY
      const newItems: CanvasItem[] = []

      // Find the largest selected image to use as target size
      const selectedImages = selectedItems.filter((item): item is typeof item & { type: 'image' } => item.type === 'image')
      let targetSize = 400 // default max size
      if (selectedImages.length > 0) {
        // Find the largest displayed dimension among selected images
        targetSize = Math.max(...selectedImages.map(img => {
          const displayedWidth = img.width * (img.scaleX ?? 1)
          const displayedHeight = img.height * (img.scaleY ?? 1)
          return Math.max(displayedWidth, displayedHeight)
        }))
      }

      for (const dataUrl of images) {
        const item = await new Promise<CanvasItem>((resolve) => {
          const img = new window.Image()
          img.onload = () => {
            // Scale to match selected image size, or default max size
            let width = img.width
            let height = img.height
            if (width > targetSize || height > targetSize) {
              const scale = targetSize / Math.max(width, height)
              width = Math.round(width * scale)
              height = Math.round(height * scale)
            }
            resolve({
              id: uuidv4(),
              type: 'image' as const,
              x: outputX,
              y: currentY,
              src: dataUrl,
              width,
              height,
            })
          }
          img.onerror = () => {
            // Fallback to default size if image fails to load
            resolve({
              id: uuidv4(),
              type: 'image' as const,
              x: outputX,
              y: currentY,
              src: dataUrl,
              width: 200,
              height: 200,
            })
          }
          img.src = dataUrl
        })
        newItems.push(item)
        currentY = item.y + item.height + 20
      }

      if (newItems.length > 0) {
        updateActiveSceneItems((prev) => [...prev, ...newItems])
      } else {
        alert('No images were generated. The model may not have produced any image output.')
      }

      playNotificationSound()
    } catch (error) {
      playNotificationSound('failure')
      console.error('Failed to run image generation prompt:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to generate image: ${message}`)
    } finally {
      // Mark prompt as no longer running
      setRunningImageGenPromptIds((prev) => {
        const next = new Set(prev)
        next.delete(promptId)
        return next
      })
    }
  }, [items, selectedIds, updateActiveSceneItems, isOffline, activeSceneId])

  const handleRunHtmlGenPrompt = useCallback(async (promptId: string) => {
    const promptItem = items.find((item) => item.id === promptId && item.type === 'html-gen-prompt')
    if (!promptItem || promptItem.type !== 'html-gen-prompt') return

    // Mark prompt as running
    setRunningHtmlGenPromptIds((prev) => new Set(prev).add(promptId))

    // Gather selected items (excluding the prompt itself)
    const selectedItems = items.filter((item) => selectedIds.includes(item.id) && item.id !== promptId)

    // Convert to spatial JSON format (images use placeholder IDs to keep prompt small)
    const { spatialData, imageMap } = convertItemsToSpatialJson(selectedItems)

    // Update debug panel with request payload
    const debugPayload = {
      spatialData,
      userPrompt: promptItem.text,
      model: promptItem.model,
      imageMapKeys: Array.from(imageMap.keys()),
    }
    setDebugContent(JSON.stringify(debugPayload, null, 2))

    try {
      let html = await generateHtml(spatialData, promptItem.text, promptItem.model)

      // Replace image placeholder IDs with actual source URLs
      html = replaceImagePlaceholders(html, imageMap)

      // Sanitize LLM-generated HTML
      if (config.features.sanitizeHtml) {
        html = DOMPurify.sanitize(html, {
          WHOLE_DOCUMENT: true,
          ADD_TAGS: ['style', 'link', 'meta', '#comment'],
          ADD_ATTR: ['charset', 'content'],
          FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
        })
      }

      // Position output to the right of the prompt, aligned with top
      // Find existing outputs to stack vertically
      const outputX = promptItem.x + promptItem.width + 20
      const existingOutputsToRight = items.filter(item =>
        item.x >= outputX - 10 &&
        item.x <= outputX + 10 &&
        item.y >= promptItem.y - 10
      )
      const outputY = existingOutputsToRight.length > 0
        ? Math.max(...existingOutputsToRight.map(item => item.y + item.height)) + 20
        : promptItem.y

      // Generate title before creating item so it's saved properly
      const title = await generateHtmlTitle(html)

      // Create new HtmlItem with result
      const newItem: CanvasItem = {
        id: uuidv4(),
        type: 'html',
        label: title,
        x: outputX,
        y: outputY,
        html: html,
        width: 800,
        height: 600,
        zoom: 0.75,
      }
      updateActiveSceneItems((prev) => [...prev, newItem])

      playNotificationSound()
    } catch (error) {
      playNotificationSound('failure')
      console.error('Failed to run HTML gen prompt:', error)
      const message = error instanceof Error ? error.message : 'Unknown error'
      alert(`Failed to generate HTML: ${message}`)
    } finally {
      // Mark prompt as no longer running
      setRunningHtmlGenPromptIds((prev) => {
        const next = new Set(prev)
        next.delete(promptId)
        return next
      })
    }
  }, [items, selectedIds, updateActiveSceneItems])

  return { handleRunPrompt, handleRunImageGenPrompt, handleRunHtmlGenPrompt }
}
