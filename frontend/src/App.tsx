import { useState, useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import InfiniteCanvas from './components/InfiniteCanvas'
import Toolbar from './components/Toolbar'
import TabBar from './components/TabBar'
import StatusBar from './components/StatusBar'
import DebugPanel from './components/DebugPanel'
import { CanvasItem, Scene } from './types'
import { saveScene, loadScene, listScenes, deleteScene, loadHistory, saveHistory } from './api/scenes'
import { generateFromPrompt, generateImage, generateHtml, ContentItem } from './api/llm'
import { convertItemsToSpatialJson, replaceImagePlaceholders } from './utils/spatialJson'
import { isHtmlContent, stripCodeFences } from './utils/htmlDetection'
import {
  HistoryStack,
  AddObjectChange,
  DeleteObjectChange,
  TransformObjectChange,
  UpdateTextChange,
  UpdatePromptChange,
  UpdateModelChange,
  ChangeRecord,
} from './history'

function createScene(name: string): Scene {
  const now = new Date().toISOString()
  return {
    id: uuidv4(),
    name,
    items: [],
    createdAt: now,
    modifiedAt: now,
  }
}

function App() {
  const [openScenes, setOpenScenes] = useState<Scene[]>([])
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [isLoading, setIsLoading] = useState(true)
  const [runningPromptIds, setRunningPromptIds] = useState<Set<string>>(new Set())
  const [runningImageGenPromptIds, setRunningImageGenPromptIds] = useState<Set<string>>(new Set())
  const [runningHtmlGenPromptIds, setRunningHtmlGenPromptIds] = useState<Set<string>>(new Set())
  const [debugPanelOpen, setDebugPanelOpen] = useState(false)
  const [debugContent, setDebugContent] = useState('')
  const [historyMap, setHistoryMap] = useState<Map<string, HistoryStack>>(new Map())
  const [historyVersion, setHistoryVersion] = useState(0) // Used to trigger re-renders on history change
  const saveTimeoutRef = useRef<number | null>(null)
  const historySaveTimeoutRef = useRef<number | null>(null)
  const lastSavedRef = useRef<Map<string, string>>(new Map())
  const lastSavedHistoryRef = useRef<Map<string, string>>(new Map())

  const activeScene = openScenes.find((s) => s.id === activeSceneId)
  const items = activeScene?.items ?? []

  // History for active scene
  const activeHistory = activeSceneId ? historyMap.get(activeSceneId) : null
  const canUndo = activeHistory?.canUndo() ?? false
  const canRedo = activeHistory?.canRedo() ?? false

  // Helper to push a change record to history
  const pushChange = useCallback((change: ChangeRecord) => {
    if (!activeSceneId) return

    setHistoryMap((prev) => {
      const newMap = new Map(prev)
      const oldHistory = prev.get(activeSceneId)
      // Clone before mutating to ensure immutability (required for React Strict Mode)
      const newHistory = oldHistory ? oldHistory.clone() : new HistoryStack()
      newHistory.push(change)
      newMap.set(activeSceneId, newHistory)
      return newMap
    })
    // Trigger re-render for canUndo/canRedo
    setHistoryVersion((v) => v + 1)
  }, [activeSceneId])

  // Load all scenes from S3 on initial mount
  useEffect(() => {
    async function loadAllScenes() {
      try {
        const sceneList = await listScenes()
        if (sceneList.length === 0) {
          // No saved scenes, create a default one
          const defaultScene = createScene('Scene 1')
          setOpenScenes([defaultScene])
          setActiveSceneId(defaultScene.id)
          lastSavedRef.current.set(defaultScene.id, JSON.stringify(defaultScene))
          // Initialize empty history for new scene
          setHistoryMap(new Map([[defaultScene.id, new HistoryStack()]]))
        } else {
          // Load all scenes and their histories
          const scenesWithHistory = await Promise.all(
            sceneList.map(async (meta) => {
              const scene = await loadScene(meta.id)
              let history: HistoryStack
              try {
                const serializedHistory = await loadHistory(meta.id)
                history = HistoryStack.deserialize(serializedHistory)
                lastSavedHistoryRef.current.set(meta.id, JSON.stringify(serializedHistory))
              } catch {
                history = new HistoryStack()
              }
              return { scene, history }
            })
          )
          // Mark all loaded scenes as saved
          const newHistoryMap = new Map<string, HistoryStack>()
          scenesWithHistory.forEach(({ scene, history }) => {
            lastSavedRef.current.set(scene.id, JSON.stringify(scene))
            newHistoryMap.set(scene.id, history)
          })
          setOpenScenes(scenesWithHistory.map(({ scene }) => scene))
          setHistoryMap(newHistoryMap)
          setActiveSceneId(scenesWithHistory[0]?.scene.id ?? null)
        }
      } catch (error) {
        console.error('Failed to load scenes:', error)
        // On error, create a default scene
        const defaultScene = createScene('Scene 1')
        setOpenScenes([defaultScene])
        setActiveSceneId(defaultScene.id)
        lastSavedRef.current.set(defaultScene.id, JSON.stringify(defaultScene))
        setHistoryMap(new Map([[defaultScene.id, new HistoryStack()]]))
      } finally {
        setIsLoading(false)
      }
    }
    loadAllScenes()
  }, [])

  // Auto-save when active scene changes (debounced)
  useEffect(() => {
    if (!activeScene || isLoading) return

    const sceneJson = JSON.stringify(activeScene)
    const lastSaved = lastSavedRef.current.get(activeScene.id)

    // Skip if nothing changed
    if (sceneJson === lastSaved) return

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce save by 1 second
    saveTimeoutRef.current = window.setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await saveScene(activeScene)
        lastSavedRef.current.set(activeScene.id, JSON.stringify(activeScene))
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch (error) {
        console.error('Failed to auto-save scene:', error)
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    }, 1000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [activeScene, isLoading])

  // Auto-save history when it changes (debounced)
  useEffect(() => {
    if (!activeSceneId || isLoading) return

    const history = historyMap.get(activeSceneId)
    if (!history) return

    const serialized = history.serialize()
    const historyJson = JSON.stringify(serialized)
    const lastSaved = lastSavedHistoryRef.current.get(activeSceneId)

    // Skip if nothing changed
    if (historyJson === lastSaved) return

    // Clear any pending save
    if (historySaveTimeoutRef.current) {
      clearTimeout(historySaveTimeoutRef.current)
    }

    // Debounce save by 2 seconds
    historySaveTimeoutRef.current = window.setTimeout(async () => {
      try {
        await saveHistory(activeSceneId, serialized)
        lastSavedHistoryRef.current.set(activeSceneId, JSON.stringify(serialized))
      } catch (error) {
        console.error('Failed to auto-save history:', error)
      }
    }, 2000)

    return () => {
      if (historySaveTimeoutRef.current) {
        clearTimeout(historySaveTimeoutRef.current)
      }
    }
  }, [historyMap, historyVersion, activeSceneId, isLoading])

  // Undo handler
  const handleUndo = useCallback(() => {
    if (!activeSceneId || !activeHistory?.canUndo()) return

    const currentItems = activeScene?.items ?? []
    const newItems = activeHistory.undo(currentItems)
    if (!newItems) return

    // Update scene items directly (without creating a new history entry)
    setOpenScenes((prev) =>
      prev.map((scene) =>
        scene.id === activeSceneId
          ? { ...scene, items: newItems, modifiedAt: new Date().toISOString() }
          : scene
      )
    )
    setHistoryVersion((v) => v + 1)
  }, [activeSceneId, activeHistory, activeScene])

  // Redo handler
  const handleRedo = useCallback(() => {
    if (!activeSceneId || !activeHistory?.canRedo()) return

    const currentItems = activeScene?.items ?? []
    const newItems = activeHistory.redo(currentItems)
    if (!newItems) return

    // Update scene items directly (without creating a new history entry)
    setOpenScenes((prev) =>
      prev.map((scene) =>
        scene.id === activeSceneId
          ? { ...scene, items: newItems, modifiedAt: new Date().toISOString() }
          : scene
      )
    )
    setHistoryVersion((v) => v + 1)
  }, [activeSceneId, activeHistory, activeScene])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if (
        ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Z')
      ) {
        e.preventDefault()
        handleRedo()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

  // Helper to update the active scene's items
  const updateActiveSceneItems = useCallback(
    (updater: (items: CanvasItem[]) => CanvasItem[]) => {
      setOpenScenes((prev) =>
        prev.map((scene) =>
          scene.id === activeSceneId
            ? { ...scene, items: updater(scene.items), modifiedAt: new Date().toISOString() }
            : scene
        )
      )
    },
    [activeSceneId]
  )

  // Scene management
  const addScene = useCallback(() => {
    const newScene = createScene(`Scene ${openScenes.length + 1}`)
    lastSavedRef.current.set(newScene.id, JSON.stringify(newScene))
    setOpenScenes((prev) => [...prev, newScene])
    setActiveSceneId(newScene.id)
    // Initialize empty history for new scene
    setHistoryMap((prev) => {
      const newMap = new Map(prev)
      newMap.set(newScene.id, new HistoryStack())
      return newMap
    })
  }, [openScenes.length])

  const selectScene = useCallback((id: string) => {
    setActiveSceneId(id)
  }, [])

  const renameScene = useCallback(async (id: string, name: string) => {
    const now = new Date().toISOString()
    let updatedScene: Scene | null = null

    setOpenScenes((prev) =>
      prev.map((scene) => {
        if (scene.id === id) {
          updatedScene = { ...scene, name, modifiedAt: now }
          return updatedScene
        }
        return scene
      })
    )

    // Save the renamed scene
    if (updatedScene) {
      try {
        setSaveStatus('saving')
        await saveScene(updatedScene)
        lastSavedRef.current.set(id, JSON.stringify(updatedScene))
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 1500)
      } catch (error) {
        console.error('Failed to save renamed scene:', error)
        setSaveStatus('error')
        setTimeout(() => setSaveStatus('idle'), 3000)
      }
    }
  }, [])

  const closeScene = useCallback((id: string) => {
    setOpenScenes((prev) => {
      const newScenes = prev.filter((s) => s.id !== id)
      // If closing the active scene, switch to another one
      if (activeSceneId === id) {
        const closingIndex = prev.findIndex((s) => s.id === id)
        const newActiveId = newScenes[Math.min(closingIndex, newScenes.length - 1)]?.id ?? null
        setActiveSceneId(newActiveId)
      }
      return newScenes
    })
  }, [activeSceneId])

  const handleDeleteScene = useCallback(async (id: string) => {
    try {
      await deleteScene(id)
      // Clean up the saved state tracking
      lastSavedRef.current.delete(id)
      // Remove from open scenes
      setOpenScenes((prev) => {
        const newScenes = prev.filter((s) => s.id !== id)
        // If deleting the active scene, switch to another one
        if (activeSceneId === id) {
          const deletingIndex = prev.findIndex((s) => s.id === id)
          const newActiveId = newScenes[Math.min(deletingIndex, newScenes.length - 1)]?.id ?? null
          setActiveSceneId(newActiveId)
        }
        return newScenes
      })
    } catch (error) {
      console.error('Failed to delete scene:', error)
      alert('Failed to delete scene')
    }
  }, [activeSceneId])

  // Item management (operates on active scene)
  const addTextItem = useCallback(() => {
    const newItem: CanvasItem = {
      id: uuidv4(),
      type: 'text',
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      text: 'Double-click to edit',
      fontSize: 16,
      width: 200,
      height: 100,
    }
    pushChange(new AddObjectChange(newItem))
    updateActiveSceneItems((prev) => [...prev, newItem])
  }, [updateActiveSceneItems, pushChange])

  const addImageItem = useCallback(
    (src: string, width: number, height: number) => {
      const newItem: CanvasItem = {
        id: uuidv4(),
        type: 'image',
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
        src,
        width,
        height,
      }
      pushChange(new AddObjectChange(newItem))
      updateActiveSceneItems((prev) => [...prev, newItem])
    },
    [updateActiveSceneItems, pushChange]
  )

  const addPromptItem = useCallback(() => {
    const newItem: CanvasItem = {
      id: uuidv4(),
      type: 'prompt',
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      label: 'Prompt',
      text: 'Enter your prompt here...',
      fontSize: 14,
      width: 300,
      height: 150,
      model: 'claude-sonnet',
    }
    pushChange(new AddObjectChange(newItem))
    updateActiveSceneItems((prev) => [...prev, newItem])
  }, [updateActiveSceneItems, pushChange])

  const addImageGenPromptItem = useCallback(() => {
    const newItem: CanvasItem = {
      id: uuidv4(),
      type: 'image-gen-prompt',
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      label: 'Image Gen',
      text: 'Describe the image you want to generate...',
      fontSize: 14,
      width: 300,
      height: 150,
      model: 'gemini-imagen',
    }
    pushChange(new AddObjectChange(newItem))
    updateActiveSceneItems((prev) => [...prev, newItem])
  }, [updateActiveSceneItems, pushChange])

  const addHtmlGenPromptItem = useCallback(() => {
    const newItem: CanvasItem = {
      id: uuidv4(),
      type: 'html-gen-prompt',
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      label: 'HTML Gen',
      text: 'Describe the webpage you want to create...',
      fontSize: 14,
      width: 300,
      height: 150,
      model: 'claude-sonnet',
    }
    pushChange(new AddObjectChange(newItem))
    updateActiveSceneItems((prev) => [...prev, newItem])
  }, [updateActiveSceneItems, pushChange])

  const addTestHtmlItem = useCallback(() => {
    const testHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 16px;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    h1 { margin: 0 0 12px 0; font-size: 18px; }
    p { margin: 0; font-size: 14px; line-height: 1.5; }
    .highlight { background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>HTML View Test</h1>
  <p>This is a <span class="highlight">formatted HTML</span> content block.</p>
  <p>It supports <strong>bold</strong>, <em>italic</em>, and other HTML elements.</p>
</body>
</html>
    `.trim()

    const newItem: CanvasItem = {
      id: uuidv4(),
      type: 'html',
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      html: testHtml,
      width: 300,
      height: 200,
    }
    pushChange(new AddObjectChange(newItem))
    updateActiveSceneItems((prev) => [...prev, newItem])
  }, [updateActiveSceneItems, pushChange])

  const addTextAt = useCallback(
    (x: number, y: number, text: string) => {
      const newItem: CanvasItem = {
        id: uuidv4(),
        type: 'text',
        x,
        y,
        text,
        fontSize: 16,
        width: 200,
        height: 100,
      }
      pushChange(new AddObjectChange(newItem))
      updateActiveSceneItems((prev) => [...prev, newItem])
    },
    [updateActiveSceneItems, pushChange]
  )

  const addImageAt = useCallback(
    (x: number, y: number, src: string, width: number, height: number) => {
      const newItem: CanvasItem = {
        id: uuidv4(),
        type: 'image',
        x,
        y,
        src,
        width,
        height,
      }
      pushChange(new AddObjectChange(newItem))
      updateActiveSceneItems((prev) => [...prev, newItem])
    },
    [updateActiveSceneItems, pushChange]
  )

  const updateItem = useCallback(
    (id: string, changes: Partial<CanvasItem>) => {
      const item = items.find((i) => i.id === id)
      if (!item) return

      // Determine change type and create appropriate record
      const hasTransform = 'x' in changes || 'y' in changes || 'width' in changes ||
        'height' in changes || 'scaleX' in changes || 'scaleY' in changes || 'rotation' in changes
      const hasText = 'text' in changes && item.type === 'text'
      const hasPromptText = ('text' in changes || 'label' in changes) &&
        (item.type === 'prompt' || item.type === 'image-gen-prompt' || item.type === 'html-gen-prompt')
      const hasModel = 'model' in changes &&
        (item.type === 'prompt' || item.type === 'image-gen-prompt' || item.type === 'html-gen-prompt')

      // Skip history for selection changes
      const isSelectionOnly = Object.keys(changes).every((k) => k === 'selected')

      if (!isSelectionOnly) {
        if (hasText && item.type === 'text') {
          // Only record if text actually changed
          if (item.text !== changes.text) {
            pushChange(new UpdateTextChange(id, item.text, changes.text as string))
          }
        } else if (hasPromptText && (item.type === 'prompt' || item.type === 'image-gen-prompt' || item.type === 'html-gen-prompt')) {
          const newLabel = ('label' in changes ? changes.label : item.label) as string
          const newText = ('text' in changes ? changes.text : item.text) as string
          // Only record if label or text actually changed
          if (item.label !== newLabel || item.text !== newText) {
            pushChange(new UpdatePromptChange(id, item.label, item.text, newLabel, newText))
          }
        } else if (hasModel && (item.type === 'prompt' || item.type === 'image-gen-prompt' || item.type === 'html-gen-prompt')) {
          // Only record if model actually changed
          if (item.model !== changes.model) {
            pushChange(new UpdateModelChange(id, item.model, changes.model as string))
          }
        } else if (hasTransform) {
          const oldTransform = { x: item.x, y: item.y, width: item.width, height: item.height }
          if (item.type === 'image') {
            Object.assign(oldTransform, { scaleX: item.scaleX, scaleY: item.scaleY, rotation: item.rotation })
          }
          const newTransform = { ...oldTransform }
          if ('x' in changes) newTransform.x = changes.x as number
          if ('y' in changes) newTransform.y = changes.y as number
          if ('width' in changes) newTransform.width = changes.width as number
          if ('height' in changes) newTransform.height = changes.height as number
          if ('scaleX' in changes) (newTransform as Record<string, unknown>).scaleX = changes.scaleX
          if ('scaleY' in changes) (newTransform as Record<string, unknown>).scaleY = changes.scaleY
          if ('rotation' in changes) (newTransform as Record<string, unknown>).rotation = changes.rotation
          // Only record if transform actually changed
          if (JSON.stringify(oldTransform) !== JSON.stringify(newTransform)) {
            pushChange(new TransformObjectChange(id, oldTransform, newTransform))
          }
        }
      }

      updateActiveSceneItems((prev) =>
        prev.map((i) =>
          i.id === id ? ({ ...i, ...changes } as CanvasItem) : i
        )
      )
    },
    [updateActiveSceneItems, items, pushChange]
  )

  const deleteSelected = useCallback(() => {
    // Record deletion for each selected item
    const selectedItems = items.filter((item) => item.selected)
    selectedItems.forEach((item) => {
      pushChange(new DeleteObjectChange(item))
    })
    updateActiveSceneItems((prev) => prev.filter((item) => !item.selected))
  }, [updateActiveSceneItems, items, pushChange])

  const selectItems = useCallback(
    (ids: string[]) => {
      updateActiveSceneItems((prev) =>
        prev.map((item) => ({ ...item, selected: ids.includes(item.id) }))
      )
    },
    [updateActiveSceneItems]
  )

  const getSelectedItems = useCallback(() => {
    return items.filter((item) => item.selected)
  }, [items])

  const handleRunPrompt = useCallback(async (promptId: string) => {
    const promptItem = items.find((item) => item.id === promptId && item.type === 'prompt')
    if (!promptItem || promptItem.type !== 'prompt') return

    // Mark prompt as running
    setRunningPromptIds((prev) => new Set(prev).add(promptId))

    // Gather selected items (excluding the prompt itself)
    const selectedItems = items.filter((item) => item.selected && item.id !== promptId)

    // Convert to ContentItem format for the API
    const contentItems: ContentItem[] = selectedItems.map((item) => {
      if (item.type === 'text') {
        return { type: 'text' as const, text: item.text }
      } else if (item.type === 'image') {
        return { type: 'image' as const, src: item.src }
      } else if (item.type === 'prompt') {
        return { type: 'text' as const, text: `[${item.label}]: ${item.text}` }
      }
      return { type: 'text' as const, text: '' }
    }).filter((item) => item.text || item.src)

    try {
      const result = await generateFromPrompt(contentItems, promptItem.text, promptItem.model)

      // Check if the result looks like HTML content
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

      let newItem: CanvasItem
      if (isHtmlContent(result)) {
        // Create an HTML view item for webpage content
        // Strip code fences that LLMs often wrap around HTML
        const htmlContent = stripCodeFences(result).trim()
        newItem = {
          id: uuidv4(),
          type: 'html',
          x: outputX,
          y: outputY,
          html: htmlContent,
          width: 800,
          height: 300,
        }
      } else {
        // Create a text item for regular text content
        newItem = {
          id: uuidv4(),
          type: 'text',
          x: outputX,
          y: outputY,
          text: result,
          fontSize: 14,
          width: Math.max(promptItem.width, 300),
          height: 200,
        }
      }
      updateActiveSceneItems((prev) => [...prev, newItem])
    } catch (error) {
      console.error('Failed to run prompt:', error)
      alert('Failed to run prompt. Check the console for details.')
    } finally {
      // Mark prompt as no longer running
      setRunningPromptIds((prev) => {
        const next = new Set(prev)
        next.delete(promptId)
        return next
      })
    }
  }, [items, updateActiveSceneItems])

  const handleRunImageGenPrompt = useCallback(async (promptId: string) => {
    const promptItem = items.find((item) => item.id === promptId && item.type === 'image-gen-prompt')
    if (!promptItem || promptItem.type !== 'image-gen-prompt') return

    // Mark prompt as running
    setRunningImageGenPromptIds((prev) => new Set(prev).add(promptId))

    // Gather selected items (excluding the prompt itself)
    const selectedItems = items.filter((item) => item.selected && item.id !== promptId)

    // Convert to ContentItem format for the API
    const contentItems: ContentItem[] = selectedItems.map((item) => {
      if (item.type === 'text') {
        return { type: 'text' as const, text: item.text }
      } else if (item.type === 'image') {
        return { type: 'image' as const, src: item.src }
      } else if (item.type === 'prompt' || item.type === 'image-gen-prompt') {
        return { type: 'text' as const, text: `[${item.label}]: ${item.text}` }
      }
      return { type: 'text' as const, text: '' }
    }).filter((item) => item.text || item.src)

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

      for (const dataUrl of images) {
        const item = await new Promise<CanvasItem>((resolve) => {
          const img = new window.Image()
          img.onload = () => {
            // Scale down if too large, maintaining aspect ratio
            const maxSize = 400
            let width = img.width
            let height = img.height
            if (width > maxSize || height > maxSize) {
              const scale = maxSize / Math.max(width, height)
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
    } catch (error) {
      console.error('Failed to run image generation prompt:', error)
      alert('Failed to generate image. Check the console for details.')
    } finally {
      // Mark prompt as no longer running
      setRunningImageGenPromptIds((prev) => {
        const next = new Set(prev)
        next.delete(promptId)
        return next
      })
    }
  }, [items, updateActiveSceneItems])

  const handleRunHtmlGenPrompt = useCallback(async (promptId: string) => {
    const promptItem = items.find((item) => item.id === promptId && item.type === 'html-gen-prompt')
    if (!promptItem || promptItem.type !== 'html-gen-prompt') return

    // Mark prompt as running
    setRunningHtmlGenPromptIds((prev) => new Set(prev).add(promptId))

    // Gather selected items (excluding the prompt itself)
    const selectedItems = items.filter((item) => item.selected && item.id !== promptId)

    // Convert to spatial JSON format (images use placeholder IDs to keep prompt small)
    const { blocks: spatialItems, imageMap } = convertItemsToSpatialJson(selectedItems)

    // Update debug panel with request payload
    const debugPayload = {
      spatialItems,
      userPrompt: promptItem.text,
      model: promptItem.model,
      imageMapKeys: Array.from(imageMap.keys()),
    }
    setDebugContent(JSON.stringify(debugPayload, null, 2))

    try {
      let html = await generateHtml(spatialItems, promptItem.text, promptItem.model)

      // Replace image placeholder IDs with actual source URLs
      html = replaceImagePlaceholders(html, imageMap)

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

      // Create new HtmlItem with result
      const newItem: CanvasItem = {
        id: uuidv4(),
        type: 'html',
        x: outputX,
        y: outputY,
        html: html,
        width: 800,
        height: 600,
      }
      updateActiveSceneItems((prev) => [...prev, newItem])
    } catch (error) {
      console.error('Failed to run HTML gen prompt:', error)
      alert('Failed to generate HTML. Check the console for details.')
    } finally {
      // Mark prompt as no longer running
      setRunningHtmlGenPromptIds((prev) => {
        const next = new Set(prev)
        next.delete(promptId)
        return next
      })
    }
  }, [items, updateActiveSceneItems])

  if (isLoading) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading scenes...
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        onAddText={addTextItem}
        onAddImage={addImageItem}
        onAddPrompt={addPromptItem}
        onAddImageGenPrompt={addImageGenPromptItem}
        onAddHtmlGenPrompt={addHtmlGenPromptItem}
        onAddTestHtml={addTestHtmlItem}
        onDelete={deleteSelected}
        onSendToLLM={() => {
          const selected = getSelectedItems()
          console.log('Send to LLM:', selected)
          // TODO: Implement LLM integration
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        hasSelection={items.some((item) => item.selected)}
        canUndo={canUndo}
        canRedo={canRedo}
        saveStatus={saveStatus}
      />
      <TabBar
        scenes={openScenes}
        activeSceneId={activeSceneId}
        onSelectScene={selectScene}
        onAddScene={addScene}
        onRenameScene={renameScene}
        onCloseScene={closeScene}
        onDeleteScene={handleDeleteScene}
      />
      {activeScene ? (
        <InfiniteCanvas
          items={items}
          onUpdateItem={updateItem}
          onSelectItems={selectItems}
          onAddTextAt={addTextAt}
          onAddImageAt={addImageAt}
          onDeleteSelected={deleteSelected}
          onRunPrompt={handleRunPrompt}
          runningPromptIds={runningPromptIds}
          onRunImageGenPrompt={handleRunImageGenPrompt}
          runningImageGenPromptIds={runningImageGenPromptIds}
          onRunHtmlGenPrompt={handleRunHtmlGenPrompt}
          runningHtmlGenPromptIds={runningHtmlGenPromptIds}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          No scene open. Click + to create a new scene.
        </div>
      )}
      {debugPanelOpen && (
        <DebugPanel
          content={debugContent}
          onClose={() => setDebugPanelOpen(false)}
        />
      )}
      <StatusBar
        onToggleDebug={() => setDebugPanelOpen((prev) => !prev)}
        debugOpen={debugPanelOpen}
      />
    </div>
  )
}

export default App
