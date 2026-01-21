import { useState, useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import InfiniteCanvas from './components/InfiniteCanvas'
import Toolbar from './components/Toolbar'
import TabBar from './components/TabBar'
import { CanvasItem, Scene } from './types'
import { saveScene, loadScene, listScenes, deleteScene } from './api/scenes'
import { generateFromPrompt, generateImage, ContentItem } from './api/llm'

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
  const saveTimeoutRef = useRef<number | null>(null)
  const lastSavedRef = useRef<Map<string, string>>(new Map())

  const activeScene = openScenes.find((s) => s.id === activeSceneId)
  const items = activeScene?.items ?? []

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
        } else {
          // Load all scenes
          const scenes = await Promise.all(
            sceneList.map((meta) => loadScene(meta.id))
          )
          // Mark all loaded scenes as saved
          scenes.forEach((scene) => {
            lastSavedRef.current.set(scene.id, JSON.stringify(scene))
          })
          setOpenScenes(scenes)
          setActiveSceneId(scenes[0]?.id ?? null)
        }
      } catch (error) {
        console.error('Failed to load scenes:', error)
        // On error, create a default scene
        const defaultScene = createScene('Scene 1')
        setOpenScenes([defaultScene])
        setActiveSceneId(defaultScene.id)
        lastSavedRef.current.set(defaultScene.id, JSON.stringify(defaultScene))
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
    updateActiveSceneItems((prev) => [...prev, newItem])
  }, [updateActiveSceneItems])

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
      updateActiveSceneItems((prev) => [...prev, newItem])
    },
    [updateActiveSceneItems]
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
    updateActiveSceneItems((prev) => [...prev, newItem])
  }, [updateActiveSceneItems])

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
    updateActiveSceneItems((prev) => [...prev, newItem])
  }, [updateActiveSceneItems])

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
      updateActiveSceneItems((prev) => [...prev, newItem])
    },
    [updateActiveSceneItems]
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
      updateActiveSceneItems((prev) => [...prev, newItem])
    },
    [updateActiveSceneItems]
  )

  const updateItem = useCallback(
    (id: string, changes: Partial<CanvasItem>) => {
      updateActiveSceneItems((prev) =>
        prev.map((item) =>
          item.id === id ? ({ ...item, ...changes } as CanvasItem) : item
        )
      )
    },
    [updateActiveSceneItems]
  )

  const deleteSelected = useCallback(() => {
    updateActiveSceneItems((prev) => prev.filter((item) => !item.selected))
  }, [updateActiveSceneItems])

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

      // Create a new text item with the result, positioned below the prompt
      const newItem: CanvasItem = {
        id: uuidv4(),
        type: 'text',
        x: promptItem.x,
        y: promptItem.y + promptItem.height + 20,
        text: result,
        fontSize: 14,
        width: Math.max(promptItem.width, 300),
        height: 200,
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

      // Create new image items for each generated image, positioned below the prompt
      const newItems: CanvasItem[] = images.map((dataUrl, index) => {
        // Create an Image to get dimensions
        return {
          id: uuidv4(),
          type: 'image' as const,
          x: promptItem.x + index * 220,
          y: promptItem.y + promptItem.height + 20,
          src: dataUrl,
          width: 200,
          height: 200,
        }
      })

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
        onDelete={deleteSelected}
        onSendToLLM={() => {
          const selected = getSelectedItems()
          console.log('Send to LLM:', selected)
          // TODO: Implement LLM integration
        }}
        hasSelection={items.some((item) => item.selected)}
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
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
          No scene open. Click + to create a new scene.
        </div>
      )}
    </div>
  )
}

export default App
