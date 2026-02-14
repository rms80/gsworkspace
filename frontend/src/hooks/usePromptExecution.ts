import { useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { CanvasItem, TextFileItem } from '../types'
import { generateFromPrompt, ContentItem, generateHtmlTitle } from '../api/llm'
import { getCroppedImageDataUrl } from '../utils/imageCrop'
import { isHtmlContent, stripCodeFences } from '../utils/htmlDetection'
import { extractCsvBlocks } from '../utils/csvExtractor'
import { uploadTextFile } from '../api/textfiles'
import DOMPurify from 'dompurify'
import { config } from '../config'

interface PromptExecutionContext {
  items: CanvasItem[]
  selectedIds: string[]
  activeSceneId: string | null
  isOffline: boolean
  updateActiveSceneItems: (updater: (items: CanvasItem[]) => CanvasItem[]) => void
  setRunningPromptIds: React.Dispatch<React.SetStateAction<Set<string>>>
}

export function usePromptExecution({
  items, selectedIds, activeSceneId, isOffline,
  updateActiveSceneItems, setRunningPromptIds,
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

      // Check for CSV code fence blocks in the result
      const { text: remainingText, csvBlocks } = extractCsvBlocks(result)

      if (csvBlocks.length > 0) {
        // CSV blocks found — create TextItem for surrounding text + TextFileItems for CSVs
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

        // Position CSV items to the right of the text, or at outputX if no text
        const csvX = remainingText.trim() ? outputX + textWidth + 20 : outputX
        let csvY = outputY

        for (const csvData of csvBlocks) {
          const itemId = uuidv4()
          const csvDataUrl = 'data:text/csv;base64,' + btoa(unescape(encodeURIComponent(csvData)))
          const filename = `data-${Date.now()}.csv`

          // Upload to storage if online
          let src = csvDataUrl
          if (!isOffline && activeSceneId) {
            try {
              src = await uploadTextFile(csvDataUrl, activeSceneId, itemId, filename, 'csv')
            } catch (err) {
              console.error('Failed to upload CSV file, using data URL:', err)
            }
          }

          const csvItem: TextFileItem = {
            id: itemId,
            type: 'text-file',
            x: csvX,
            y: csvY,
            src,
            name: filename,
            width: 600,
            height: 400,
            fileSize: new Blob([csvData]).size,
            fileFormat: 'csv',
            fontMono: true,
          }
          newItems.push(csvItem)
          csvY += 400 + 20 // stack vertically with 20px gap
        }

        updateActiveSceneItems((prev) => [...prev, ...newItems])
      } else if (isHtmlContent(result)) {
        // Create an HTML view item for webpage content
        // Strip code fences that LLMs often wrap around HTML
        const strippedHtml = stripCodeFences(result).trim()
        const htmlContent = config.features.sanitizeHtml
          ? DOMPurify.sanitize(strippedHtml, {
              WHOLE_DOCUMENT: true,
              ADD_TAGS: ['style', 'link', 'meta', '#comment'],
              FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
            })
          : strippedHtml
        // If an HTML item is among the selected inputs, match its dimensions/zoom
        const inputHtmlItem = selectedItems.find((item) => item.type === 'html')
        const htmlWidth = inputHtmlItem?.type === 'html' ? inputHtmlItem.width : 800
        const htmlHeight = inputHtmlItem?.type === 'html' ? inputHtmlItem.height : 300
        const htmlZoom = inputHtmlItem?.type === 'html' ? (inputHtmlItem.zoom ?? 1) : 0.75
        // Generate title before creating item so it's saved properly
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
        // Create a text item for regular text content
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
    } catch (error) {
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

  return { handleRunPrompt }
}
