import { useState, useCallback } from 'react'
import { v4 as uuidv4 } from 'uuid'
import InfiniteCanvas from './components/InfiniteCanvas'
import Toolbar from './components/Toolbar'
import TabBar from './components/TabBar'
import { CanvasItem, Scene } from './types'

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
  const [openScenes, setOpenScenes] = useState<Scene[]>(() => [createScene('Scene 1')])
  const [activeSceneId, setActiveSceneId] = useState<string | null>(() => openScenes[0]?.id ?? null)

  const activeScene = openScenes.find((s) => s.id === activeSceneId)
  const items = activeScene?.items ?? []

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
    setOpenScenes((prev) => [...prev, newScene])
    setActiveSceneId(newScene.id)
  }, [openScenes.length])

  const selectScene = useCallback((id: string) => {
    setActiveSceneId(id)
  }, [])

  const renameScene = useCallback((id: string, name: string) => {
    setOpenScenes((prev) =>
      prev.map((scene) =>
        scene.id === id ? { ...scene, name, modifiedAt: new Date().toISOString() } : scene
      )
    )
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

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar
        onAddText={addTextItem}
        onAddImage={addImageItem}
        onDelete={deleteSelected}
        onSendToLLM={() => {
          const selected = getSelectedItems()
          console.log('Send to LLM:', selected)
          // TODO: Implement LLM integration
        }}
        hasSelection={items.some((item) => item.selected)}
      />
      <TabBar
        scenes={openScenes}
        activeSceneId={activeSceneId}
        onSelectScene={selectScene}
        onAddScene={addScene}
        onRenameScene={renameScene}
        onCloseScene={closeScene}
      />
      {activeScene ? (
        <InfiniteCanvas
          items={items}
          onUpdateItem={updateItem}
          onSelectItems={selectItems}
          onAddTextAt={addTextAt}
          onAddImageAt={addImageAt}
          onDeleteSelected={deleteSelected}
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
