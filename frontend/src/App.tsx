import { useState, useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import InfiniteCanvas from './components/InfiniteCanvas'
import MenuBar from './components/MenuBar'
import TabBar from './components/TabBar'
import OpenSceneDialog, { SceneInfo } from './components/OpenSceneDialog'
import ConflictDialog from './components/ConflictDialog'
import SettingsDialog from './components/SettingsDialog'
import StatusBar, { SaveStatus } from './components/StatusBar'
import DebugPanel from './components/DebugPanel'
import { useRemoteChangeDetection } from './hooks/useRemoteChangeDetection'
import { useBackgroundOperations } from './contexts/BackgroundOperationsContext'
import { CanvasItem, Scene } from './types'
import { saveScene, loadScene, listScenes, deleteScene, loadHistory, saveHistory, isOfflineMode, setOfflineMode, getSceneTimestamp, getStorageMode, setStorageMode, StorageMode } from './api/scenes'
import { generateFromPrompt, generateImage, generateHtml, generateHtmlTitle, ContentItem } from './api/llm'
import { convertItemsToSpatialJson, replaceImagePlaceholders } from './utils/spatialJson'
import { getCroppedImageDataUrl } from './utils/imageCrop'
import { isHtmlContent, stripCodeFences } from './utils/htmlDetection'
import { exportSceneToZip } from './utils/sceneExport'
import { importSceneFromZip, importSceneFromDirectory } from './utils/sceneImport'
import { uploadVideo, getVideoDimensions } from './api/videos'
import { uploadImage } from './api/images'
import { generateUniqueName, getExistingImageNames, getExistingVideoNames } from './utils/imageNames'
import { loadModeSettings, setOpenScenes as saveOpenScenesToSettings } from './utils/settings'
import {
  HistoryStack,
  HistoryState,
  AddObjectChange,
  DeleteObjectChange,
  TransformObjectChange,
  UpdateTextChange,
  UpdatePromptChange,
  UpdateModelChange,
  UpdateNameChange,
  SelectionChange,
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
  const { activeCount: backgroundOpsCount, startOperation, endOperation } = useBackgroundOperations()
  const [openScenes, setOpenScenes] = useState<Scene[]>([])
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null)
  const pendingDropFilesRef = useRef<File[]>([])
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [isLoading, setIsLoading] = useState(true)
  const [runningPromptIds, setRunningPromptIds] = useState<Set<string>>(new Set())
  const [runningImageGenPromptIds, setRunningImageGenPromptIds] = useState<Set<string>>(new Set())
  const [runningHtmlGenPromptIds, setRunningHtmlGenPromptIds] = useState<Set<string>>(new Set())
  const [debugPanelOpen, setDebugPanelOpen] = useState(false)
  const [debugContent, setDebugContent] = useState('')
  const [isOffline, setIsOffline] = useState(isOfflineMode())
  const [storageMode, setStorageModeState] = useState<StorageMode>(getStorageMode())
  const [historyMap, setHistoryMap] = useState<Map<string, HistoryStack>>(new Map())
  const [selectionMap, setSelectionMap] = useState<Map<string, string[]>>(new Map())
  const [historyVersion, setHistoryVersion] = useState(0) // Used to trigger re-renders on history change
  const [openSceneDialogOpen, setOpenSceneDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [availableScenes, setAvailableScenes] = useState<SceneInfo[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const saveTimeoutRef = useRef<number | null>(null)
  const historySaveTimeoutRef = useRef<number | null>(null)
  const lastSavedRef = useRef<Map<string, string>>(new Map())
  const lastSavedHistoryRef = useRef<Map<string, string>>(new Map())
  const lastKnownServerModifiedAtRef = useRef<Map<string, string>>(new Map())
  const persistedSceneIdsRef = useRef<Set<string>>(new Set()) // Tracks scenes that have been saved to server

  const activeScene = openScenes.find((s) => s.id === activeSceneId)
  const items = activeScene?.items ?? []

  // Selection for active scene (stored separately from items)
  const selectedIds = activeSceneId ? (selectionMap.get(activeSceneId) ?? []) : []

  // History for active scene
  const activeHistory = activeSceneId ? historyMap.get(activeSceneId) : null
  const canUndo = activeHistory?.canUndo() ?? false
  const canRedo = activeHistory?.canRedo() ?? false

  // Get last known server modifiedAt for the active scene
  const lastKnownServerModifiedAt = activeSceneId
    ? lastKnownServerModifiedAtRef.current.get(activeSceneId) ?? null
    : null

  // Remote change detection
  const {
    hasConflict,
    remoteModifiedAt,
    checkNow: checkRemoteChanges,
    clearConflict,
    setConflict,
  } = useRemoteChangeDetection({
    sceneId: activeSceneId,
    lastKnownServerModifiedAt,
    isOffline,
    isSaving,
  })

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

  // Function to load scenes from current storage provider
  // Respects settings for which scenes should be open
  // Pass currentMode to ensure we load settings for the correct mode
  const loadAllScenes = useCallback(async (currentMode?: StorageMode) => {
    const mode = currentMode ?? storageMode
    setIsLoading(true)
    // Clear previous saved state tracking when reloading
    lastSavedRef.current.clear()
    lastSavedHistoryRef.current.clear()
    lastKnownServerModifiedAtRef.current.clear()

    try {
      const sceneList = await listScenes()
      const modeSettings = loadModeSettings(mode)

      // Determine which scenes to open based on settings
      const availableIds = new Set(sceneList.map((s) => s.id))
      const validOpenIds = modeSettings.openSceneIds.filter((id) => availableIds.has(id))

      if (validOpenIds.length === 0) {
        // No scenes to open - show empty state
        setOpenScenes([])
        setActiveSceneId(null)
        setHistoryMap(new Map())
        setSelectionMap(new Map())
      } else {
        // Load only the scenes that were previously open
        const scenesToLoad = sceneList.filter((s) => validOpenIds.includes(s.id))

        // Load selected scenes and their histories
        const scenesWithHistory = await Promise.all(
          scenesToLoad.map(async (meta) => {
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

        // Mark all loaded scenes as saved and track server timestamps
        const newHistoryMap = new Map<string, HistoryStack>()
        const newSelectionMap = new Map<string, string[]>()
        scenesWithHistory.forEach(({ scene, history }) => {
          lastSavedRef.current.set(scene.id, JSON.stringify(scene))
          lastKnownServerModifiedAtRef.current.set(scene.id, scene.modifiedAt)
          persistedSceneIdsRef.current.add(scene.id) // Mark as persisted (loaded from server)
          newHistoryMap.set(scene.id, history)
          newSelectionMap.set(scene.id, []) // Start with empty selection
        })
        setOpenScenes(scenesWithHistory.map(({ scene }) => scene))
        setHistoryMap(newHistoryMap)
        setSelectionMap(newSelectionMap)

        // Restore active scene from settings if it's in the loaded scenes
        const loadedIds = scenesWithHistory.map(({ scene }) => scene.id)
        if (modeSettings.activeSceneId && loadedIds.includes(modeSettings.activeSceneId)) {
          setActiveSceneId(modeSettings.activeSceneId)
        } else {
          setActiveSceneId(scenesWithHistory[0]?.scene.id ?? null)
        }
      }
    } catch (error) {
      console.error('Failed to load scenes:', error)
      // On error, show empty state
      setOpenScenes([])
      setActiveSceneId(null)
      setHistoryMap(new Map())
      setSelectionMap(new Map())
    } finally {
      setIsLoading(false)
    }
  }, [isOffline])

  // Fetch backend storage mode on startup and load scenes
  useEffect(() => {
    const initializeApp = async () => {
      let modeToUse = storageMode

      // Fetch backend config if not in offline mode
      if (storageMode !== 'offline') {
        try {
          const res = await fetch('/api/config')
          const config = await res.json()
          if (config.storageMode && config.storageMode !== storageMode) {
            setStorageMode(config.storageMode)
            setStorageModeState(config.storageMode)
            modeToUse = config.storageMode
          }
        } catch (err) {
          console.error('Failed to fetch backend config:', err)
        }
      }

      // Load scenes with the correct mode
      await loadAllScenes(modeToUse)
    }

    initializeApp()
  }, []) // Only run once on mount

  // Handler to toggle offline mode
  const handleSetOfflineMode = useCallback(async (offline: boolean) => {
    const newMode: StorageMode = offline ? 'offline' : 'online'
    setOfflineMode(offline)
    setIsOffline(offline)
    setStorageModeState(newMode)
    // Reload scenes from the new storage provider with the new mode
    await loadAllScenes(newMode)
  }, [loadAllScenes])

  // Handler for storage mode changes from settings or status bar menu
  const handleStorageModeChange = useCallback(async (mode: StorageMode) => {
    const currentMode = getStorageMode()
    if (mode === currentMode) return

    // If switching between online and local, need to update backend
    if (mode !== 'offline' && currentMode !== 'offline') {
      try {
        const response = await fetch('/api/config/storage-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        })
        if (!response.ok) {
          console.error('Failed to change backend storage mode')
          return
        }
      } catch (err) {
        console.error('Error changing backend storage mode:', err)
        return
      }
    } else if (mode !== 'offline' && currentMode === 'offline') {
      // Switching from offline to online/local - update backend
      try {
        const response = await fetch('/api/config/storage-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode }),
        })
        if (!response.ok) {
          console.error('Failed to change backend storage mode')
          return
        }
      } catch (err) {
        console.error('Error changing backend storage mode:', err)
        return
      }
    }

    setStorageMode(mode)
    setStorageModeState(mode)
    setIsOffline(mode === 'offline')
    // Reload scenes from the new storage provider
    await loadAllScenes(mode)
  }, [loadAllScenes])

  // Handler for syncing storage mode when backend reports a different mode
  // This happens when the backend restarts and its persisted mode differs from frontend
  const handleStorageModeSync = useCallback(async (backendMode: StorageMode) => {
    console.log(`Syncing frontend storage mode to backend: ${backendMode}`)
    setStorageMode(backendMode)
    setStorageModeState(backendMode)
    setIsOffline(backendMode === 'offline')
    // Reload scenes from the backend's storage
    await loadAllScenes(backendMode)
  }, [loadAllScenes])

  // Auto-save when active scene changes (debounced)
  useEffect(() => {
    if (!activeScene || isLoading) return

    const sceneJson = JSON.stringify(activeScene)
    const lastSaved = lastSavedRef.current.get(activeScene.id)

    // Skip if nothing changed
    if (sceneJson === lastSaved) return

    // Mark as unsaved immediately when changes detected
    setSaveStatus('unsaved')

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Debounce save by 1 second
    saveTimeoutRef.current = window.setTimeout(async () => {
      // Check for remote changes before saving (unless offline)
      if (!isOffline) {
        const lastKnown = lastKnownServerModifiedAtRef.current.get(activeScene.id)
        if (lastKnown) {
          try {
            const remoteTimestamp = await getSceneTimestamp(activeScene.id)
            if (remoteTimestamp && remoteTimestamp.modifiedAt !== lastKnown) {
              // Remote has changed - don't save, show conflict dialog
              setConflict(remoteTimestamp.modifiedAt)
              setSaveStatus('unsaved')
              return
            }
          } catch (error) {
            // If we can't check, proceed with save (fail-open for UX)
            console.error('Failed to check remote timestamp before save:', error)
          }
        }
      }

      setSaveStatus('saving')
      setIsSaving(true)
      try {
        await saveScene(activeScene)
        lastSavedRef.current.set(activeScene.id, JSON.stringify(activeScene))
        // Update the known server timestamp to match what we just saved
        lastKnownServerModifiedAtRef.current.set(activeScene.id, activeScene.modifiedAt)
        persistedSceneIdsRef.current.add(activeScene.id) // Mark as persisted
        setSaveStatus('saved')
      } catch (error) {
        console.error('Failed to auto-save scene:', error)
        setSaveStatus('error')
      } finally {
        setIsSaving(false)
      }
    }, 1000)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [activeScene, isLoading, isOffline, setConflict])

  // Auto-save history when it changes (debounced)
  useEffect(() => {
    if (!activeSceneId || isLoading) return

    // Only save history for scenes that have been persisted to the server
    if (!persistedSceneIdsRef.current.has(activeSceneId)) return

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

  // Save open scene IDs and active scene to settings when they change
  useEffect(() => {
    if (isLoading) return
    const openIds = openScenes.map((s) => s.id)
    saveOpenScenesToSettings(openIds, activeSceneId, storageMode)
  }, [openScenes, activeSceneId, isLoading, storageMode])

  // Undo handler
  const handleUndo = useCallback(() => {
    if (!activeSceneId || !activeHistory?.canUndo()) return

    const currentState: HistoryState = {
      items: activeScene?.items ?? [],
      selectedIds: selectionMap.get(activeSceneId) ?? [],
    }
    const newState = activeHistory.undo(currentState)
    if (!newState) return

    // Update scene items directly (without creating a new history entry)
    setOpenScenes((prev) =>
      prev.map((scene) =>
        scene.id === activeSceneId
          ? { ...scene, items: newState.items, modifiedAt: new Date().toISOString() }
          : scene
      )
    )
    // Update selection state
    setSelectionMap((prev) => {
      const newMap = new Map(prev)
      newMap.set(activeSceneId, newState.selectedIds)
      return newMap
    })
    setHistoryVersion((v) => v + 1)
  }, [activeSceneId, activeHistory, activeScene, selectionMap])

  // Redo handler
  const handleRedo = useCallback(() => {
    if (!activeSceneId || !activeHistory?.canRedo()) return

    const currentState: HistoryState = {
      items: activeScene?.items ?? [],
      selectedIds: selectionMap.get(activeSceneId) ?? [],
    }
    const newState = activeHistory.redo(currentState)
    if (!newState) return

    // Update scene items directly (without creating a new history entry)
    setOpenScenes((prev) =>
      prev.map((scene) =>
        scene.id === activeSceneId
          ? { ...scene, items: newState.items, modifiedAt: new Date().toISOString() }
          : scene
      )
    )
    // Update selection state
    setSelectionMap((prev) => {
      const newMap = new Map(prev)
      newMap.set(activeSceneId, newState.selectedIds)
      return newMap
    })
    setHistoryVersion((v) => v + 1)
  }, [activeSceneId, activeHistory, activeScene, selectionMap])

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
  const addScene = useCallback(async () => {
    // Find next available scene name by checking all scenes (saved and currently open)
    const savedScenes = await listScenes()
    const existingNames = new Set([
      ...savedScenes.map((s) => s.name),
      ...openScenes.map((s) => s.name),
    ])
    let n = 1
    while (existingNames.has(`Scene ${n}`)) {
      n++
    }
    const newScene = createScene(`Scene ${n}`)
    lastSavedRef.current.set(newScene.id, JSON.stringify(newScene))
    setOpenScenes((prev) => [...prev, newScene])
    setActiveSceneId(newScene.id)
    // Initialize empty history and selection for new scene
    setHistoryMap((prev) => {
      const newMap = new Map(prev)
      newMap.set(newScene.id, new HistoryStack())
      return newMap
    })
    setSelectionMap((prev) => {
      const newMap = new Map(prev)
      newMap.set(newScene.id, [])
      return newMap
    })
  }, [openScenes])

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
        persistedSceneIdsRef.current.add(id) // Mark as persisted
        setSaveStatus('saved')
      } catch (error) {
        console.error('Failed to save renamed scene:', error)
        setSaveStatus('error')
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
      fontSize: 14,
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

  const addVideoItem = useCallback(
    (src: string, width: number, height: number, name?: string, fileSize?: number) => {
      // Scale down large videos to reasonable canvas size
      const maxDim = 640
      let w = width
      let h = height
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      const newItem: CanvasItem = {
        id: uuidv4(),
        type: 'video',
        x: 100 + Math.random() * 200,
        y: 100 + Math.random() * 200,
        src,
        name,
        width: w,
        height: h,
        originalWidth: width,
        originalHeight: height,
        fileSize,
        muted: true,
        loop: false,
      }
      pushChange(new AddObjectChange(newItem))
      updateActiveSceneItems((prev) => [...prev, newItem])
    },
    [updateActiveSceneItems, pushChange]
  )

  const handleAddVideo = useCallback(async (file: File) => {
    try {
      const dimensions = await getVideoDimensions(file)
      startOperation()
      const url = await uploadVideo(file, isOffline)
      endOperation()
      // Extract filename without extension for the label
      const name = file.name.replace(/\.[^/.]+$/, '')
      addVideoItem(url, dimensions.width, dimensions.height, name, dimensions.fileSize)
    } catch (error) {
      endOperation()
      console.error('Failed to add video:', error)
      alert('Failed to add video. Please try again.')
    }
  }, [isOffline, addVideoItem, startOperation, endOperation])

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

  const addTextAt = useCallback(
    (x: number, y: number, text: string): string => {
      const width = 400
      const height = 100
      const id = uuidv4()
      const newItem: CanvasItem = {
        id,
        type: 'text',
        x: x - width / 2,
        y: y - height / 2,
        text,
        fontSize: 14,
        width,
        height,
      }
      pushChange(new AddObjectChange(newItem))
      updateActiveSceneItems((prev) => [...prev, newItem])
      return id
    },
    [updateActiveSceneItems, pushChange]
  )

  const addImageAt = useCallback(
    (x: number, y: number, src: string, width: number, height: number, name?: string, originalWidth?: number, originalHeight?: number, fileSize?: number) => {
      // Generate unique name using the utility
      const existingNames = getExistingImageNames(items)
      const uniqueName = generateUniqueName(name || 'Image', existingNames)

      const newItem: CanvasItem = {
        id: uuidv4(),
        type: 'image',
        x: x - width / 2,
        y: y - height / 2,
        src,
        name: uniqueName,
        width,
        height,
        originalWidth,
        originalHeight,
        fileSize,
      }
      pushChange(new AddObjectChange(newItem))
      updateActiveSceneItems((prev) => [...prev, newItem])
    },
    [updateActiveSceneItems, pushChange, items]
  )

  const addVideoAt = useCallback(
    (x: number, y: number, src: string, width: number, height: number, name?: string, fileSize?: number) => {
      // Generate unique name using the utility
      const existingNames = getExistingVideoNames(items)
      const uniqueName = generateUniqueName(name || 'Video', existingNames)

      // Scale down large videos to reasonable canvas size
      const maxDim = 640
      let w = width
      let h = height
      if (w > maxDim || h > maxDim) {
        const scale = maxDim / Math.max(w, h)
        w = Math.round(w * scale)
        h = Math.round(h * scale)
      }
      const newItem: CanvasItem = {
        id: uuidv4(),
        type: 'video',
        x: x - w / 2,
        y: y - h / 2,
        src,
        name: uniqueName,
        width: w,
        height: h,
        originalWidth: width,
        originalHeight: height,
        fileSize,
        muted: true,
        loop: false,
      }
      pushChange(new AddObjectChange(newItem))
      updateActiveSceneItems((prev) => [...prev, newItem])
    },
    [updateActiveSceneItems, pushChange, items]
  )

  const updateItem = useCallback(
    (id: string, changes: Partial<CanvasItem>) => {
      const item = items.find((i) => i.id === id)
      if (!item) return

      // Determine change type and create appropriate record
      const hasTransform = 'x' in changes || 'y' in changes || 'width' in changes ||
        'height' in changes || 'scaleX' in changes || 'scaleY' in changes || 'rotation' in changes ||
        'cropRect' in changes || 'cropSrc' in changes
      const hasText = 'text' in changes && item.type === 'text'
      const hasPromptText = ('text' in changes || 'label' in changes) &&
        (item.type === 'prompt' || item.type === 'image-gen-prompt' || item.type === 'html-gen-prompt')
      const hasModel = 'model' in changes &&
        (item.type === 'prompt' || item.type === 'image-gen-prompt' || item.type === 'html-gen-prompt')
      const hasName = 'name' in changes && (item.type === 'image' || item.type === 'video')

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
      } else if (hasName && (item.type === 'image' || item.type === 'video')) {
        // Only record if name actually changed
        const oldName = item.name
        const newName = changes.name as string | undefined
        if (oldName !== newName) {
          pushChange(new UpdateNameChange(id, oldName, newName))
        }
      } else if (hasTransform) {
        const oldTransform = { x: item.x, y: item.y, width: item.width, height: item.height }
        if (item.type === 'image') {
          Object.assign(oldTransform, { scaleX: item.scaleX, scaleY: item.scaleY, rotation: item.rotation, cropRect: item.cropRect ?? null, cropSrc: item.cropSrc ?? null })
        }
        const newTransform = { ...oldTransform }
        if ('x' in changes) newTransform.x = changes.x as number
        if ('y' in changes) newTransform.y = changes.y as number
        if ('width' in changes) newTransform.width = changes.width as number
        if ('height' in changes) newTransform.height = changes.height as number
        if ('scaleX' in changes) (newTransform as Record<string, unknown>).scaleX = changes.scaleX
        if ('scaleY' in changes) (newTransform as Record<string, unknown>).scaleY = changes.scaleY
        if ('rotation' in changes) (newTransform as Record<string, unknown>).rotation = changes.rotation
        if ('cropRect' in changes) (newTransform as Record<string, unknown>).cropRect = (changes as Record<string, unknown>).cropRect ?? null
        if ('cropSrc' in changes) (newTransform as Record<string, unknown>).cropSrc = (changes as Record<string, unknown>).cropSrc ?? null
        // Only record if transform actually changed
        if (JSON.stringify(oldTransform) !== JSON.stringify(newTransform)) {
          pushChange(new TransformObjectChange(id, oldTransform, newTransform))
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

  const deleteSelected = useCallback(async () => {
    if (!activeSceneId) return
    // Get currently selected items
    const currentSelectedIds = selectionMap.get(activeSceneId) ?? []
    const selectedItems = items.filter((item) => currentSelectedIds.includes(item.id))

    // For images with data URL src, upload to S3 first to avoid storing large data in history
    // Skip this in offline mode - no point attempting upload without network
    const itemsForHistory: CanvasItem[] = isOffline
      ? selectedItems
      : await Promise.all(
          selectedItems.map(async (item) => {
            if (item.type === 'image' && item.src.startsWith('data:')) {
              try {
                const s3Url = await uploadImage(item.src, `deleted-${item.id}.png`)
                // Return item with S3 URL for history
                return { ...item, src: s3Url }
              } catch (err) {
                console.error('Failed to upload image before delete, storing data URL in history:', err)
                return item
              }
            }
            return item
          })
        )

    // Record deletion for each selected item (using S3 URLs where possible)
    itemsForHistory.forEach((item) => {
      pushChange(new DeleteObjectChange(item))
    })

    // Clear selection and remove items
    setSelectionMap((prev) => {
      const newMap = new Map(prev)
      newMap.set(activeSceneId, [])
      return newMap
    })
    updateActiveSceneItems((prev) => prev.filter((item) => !currentSelectedIds.includes(item.id)))
  }, [updateActiveSceneItems, items, pushChange, activeSceneId, selectionMap, isOffline])

  const selectItems = useCallback(
    (ids: string[]) => {
      if (!activeSceneId) return

      // Get current selection to record the change
      const oldSelectedIds = selectionMap.get(activeSceneId) ?? []

      // Only record change if selection actually changed
      if (JSON.stringify(oldSelectedIds.sort()) !== JSON.stringify([...ids].sort())) {
        pushChange(new SelectionChange(oldSelectedIds, ids))
      }

      // Update selection state
      setSelectionMap((prev) => {
        const newMap = new Map(prev)
        newMap.set(activeSceneId, ids)
        return newMap
      })
    },
    [activeSceneId, selectionMap, pushChange]
  )

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
        let src = item.src
        if (item.cropRect && activeSceneId) {
          try {
            src = await getCroppedImageDataUrl(activeSceneId, item.id, item.src, item.cropRect)
          } catch (err) {
            console.error('Failed to crop image for LLM, using original:', err)
          }
        }
        return { type: 'image' as const, src }
      } else if (item.type === 'prompt') {
        return { type: 'text' as const, text: `[${item.label}]: ${item.text}` }
      } else if (item.type === 'html') {
        return { type: 'text' as const, text: `[HTML Content]:\n${item.html}` }
      }
      return { type: 'text' as const, text: '' }
    }))).filter((item) => item.text || item.src)

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
        // Generate title before creating item so it's saved properly
        const title = await generateHtmlTitle(htmlContent)
        newItem = {
          id: uuidv4(),
          type: 'html',
          label: title,
          x: outputX,
          y: outputY,
          html: htmlContent,
          width: 800,
          height: 300,
          zoom: 0.75,
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
  }, [items, selectedIds, updateActiveSceneItems])

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
        let src = item.src
        if (item.cropRect && activeSceneId) {
          try {
            src = await getCroppedImageDataUrl(activeSceneId, item.id, item.src, item.cropRect)
          } catch (err) {
            console.error('Failed to crop image for LLM, using original:', err)
          }
        }
        return { type: 'image' as const, src }
      } else if (item.type === 'prompt' || item.type === 'image-gen-prompt') {
        return { type: 'text' as const, text: `[${item.label}]: ${item.text}` }
      }
      return { type: 'text' as const, text: '' }
    }))).filter((item) => item.text || item.src)

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
  }, [items, selectedIds, updateActiveSceneItems])

  const handleRunHtmlGenPrompt = useCallback(async (promptId: string) => {
    const promptItem = items.find((item) => item.id === promptId && item.type === 'html-gen-prompt')
    if (!promptItem || promptItem.type !== 'html-gen-prompt') return

    // Mark prompt as running
    setRunningHtmlGenPromptIds((prev) => new Set(prev).add(promptId))

    // Gather selected items (excluding the prompt itself)
    const selectedItems = items.filter((item) => selectedIds.includes(item.id) && item.id !== promptId)

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
  }, [items, selectedIds, updateActiveSceneItems])

  // Export current scene to ZIP
  const handleExportScene = useCallback(async () => {
    if (!activeScene || !activeSceneId) {
      alert('No scene to export')
      return
    }

    const history = historyMap.get(activeSceneId)
    const serializedHistory = history?.serialize() ?? { records: [], currentIndex: -1 }

    try {
      await exportSceneToZip(activeScene, serializedHistory)
    } catch (error) {
      console.error('Failed to export scene:', error)
      alert('Failed to export scene. Check the console for details.')
    }
  }, [activeScene, activeSceneId, historyMap])

  // Import scene from ZIP file
  const handleImportFromZip = useCallback(async (file: File) => {
    try {
      const { scene, history } = await importSceneFromZip(file)

      // Add the imported scene
      setOpenScenes((prev) => [...prev, scene])
      setActiveSceneId(scene.id)

      // Initialize history from imported data
      const historyStack = HistoryStack.deserialize(history)
      setHistoryMap((prev) => {
        const newMap = new Map(prev)
        newMap.set(scene.id, historyStack)
        return newMap
      })

      // Initialize empty selection
      setSelectionMap((prev) => {
        const newMap = new Map(prev)
        newMap.set(scene.id, [])
        return newMap
      })

      // Mark as needing save
      lastSavedRef.current.set(scene.id, '')
    } catch (error) {
      console.error('Failed to import scene from ZIP:', error)
      alert('Failed to import scene. Make sure the file is a valid scene archive.')
    }
  }, [])

  // Import scene from folder
  const handleImportFromFolder = useCallback(async (files: FileList) => {
    try {
      const { scene, history } = await importSceneFromDirectory(files)

      // Add the imported scene
      setOpenScenes((prev) => [...prev, scene])
      setActiveSceneId(scene.id)

      // Initialize history from imported data
      const historyStack = HistoryStack.deserialize(history)
      setHistoryMap((prev) => {
        const newMap = new Map(prev)
        newMap.set(scene.id, historyStack)
        return newMap
      })

      // Initialize empty selection
      setSelectionMap((prev) => {
        const newMap = new Map(prev)
        newMap.set(scene.id, [])
        return newMap
      })

      // Mark as needing save
      lastSavedRef.current.set(scene.id, '')
    } catch (error) {
      console.error('Failed to import scene from folder:', error)
      alert('Failed to import scene. Make sure the folder contains a valid scene.json file.')
    }
  }, [])

  // Open the "Open Scene" dialog
  const handleOpenSceneDialog = useCallback(async () => {
    try {
      const sceneList = await listScenes()
      setAvailableScenes(sceneList)
      setOpenSceneDialogOpen(true)
    } catch (error) {
      console.error('Failed to list scenes:', error)
      alert('Failed to load scene list.')
    }
  }, [])

  // Keyboard shortcuts for scene management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        handleOpenSceneDialog()
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault()
        handleExportScene()
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault()
        setSettingsDialogOpen(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleOpenSceneDialog, handleExportScene])

  // Handle opening selected scenes from the dialog
  const handleOpenScenes = useCallback(async (sceneIds: string[]) => {
    setOpenSceneDialogOpen(false)

    for (const sceneId of sceneIds) {
      // Skip if already open
      if (openScenes.some((s) => s.id === sceneId)) {
        continue
      }

      try {
        const scene = await loadScene(sceneId)
        let history: HistoryStack
        try {
          const serializedHistory = await loadHistory(sceneId)
          history = HistoryStack.deserialize(serializedHistory)
          lastSavedHistoryRef.current.set(sceneId, JSON.stringify(serializedHistory))
        } catch {
          history = new HistoryStack()
        }

        // Add to open scenes
        setOpenScenes((prev) => [...prev, scene])
        lastSavedRef.current.set(scene.id, JSON.stringify(scene))
        lastKnownServerModifiedAtRef.current.set(scene.id, scene.modifiedAt)
        persistedSceneIdsRef.current.add(scene.id) // Mark as persisted (loaded from server)

        // Initialize history
        setHistoryMap((prev) => {
          const newMap = new Map(prev)
          newMap.set(scene.id, history)
          return newMap
        })

        // Initialize empty selection
        setSelectionMap((prev) => {
          const newMap = new Map(prev)
          newMap.set(scene.id, [])
          return newMap
        })
      } catch (error) {
        console.error(`Failed to open scene ${sceneId}:`, error)
      }
    }

    // Activate the first opened scene
    if (sceneIds.length > 0) {
      setActiveSceneId(sceneIds[0])
    }
  }, [openScenes])

  // Conflict resolution: Get remote version
  const handleGetRemote = useCallback(async () => {
    if (!activeSceneId) return

    try {
      // Load the remote scene
      const remoteScene = await loadScene(activeSceneId)

      // Load the remote history
      let history: HistoryStack
      try {
        const serializedHistory = await loadHistory(activeSceneId)
        history = HistoryStack.deserialize(serializedHistory)
        lastSavedHistoryRef.current.set(activeSceneId, JSON.stringify(serializedHistory))
      } catch {
        history = new HistoryStack()
      }

      // Update the scene in state
      setOpenScenes((prev) =>
        prev.map((scene) => (scene.id === activeSceneId ? remoteScene : scene))
      )
      lastSavedRef.current.set(activeSceneId, JSON.stringify(remoteScene))
      lastKnownServerModifiedAtRef.current.set(activeSceneId, remoteScene.modifiedAt)
      persistedSceneIdsRef.current.add(activeSceneId) // Mark as persisted (loaded from server)

      // Update history
      setHistoryMap((prev) => {
        const newMap = new Map(prev)
        newMap.set(activeSceneId, history)
        return newMap
      })
      setHistoryVersion((v) => v + 1)

      // Clear selection
      setSelectionMap((prev) => {
        const newMap = new Map(prev)
        newMap.set(activeSceneId, [])
        return newMap
      })

      // Clear conflict state
      clearConflict()
      setSaveStatus('saved')
    } catch (error) {
      console.error('Failed to load remote scene:', error)
      alert('Failed to load the remote version. Please try again.')
    }
  }, [activeSceneId, clearConflict])

  // Conflict resolution: Keep local version (force save)
  const handleKeepLocal = useCallback(async () => {
    if (!activeScene) return

    try {
      setSaveStatus('saving')
      setIsSaving(true)

      // Force save local version to server
      await saveScene(activeScene)
      lastSavedRef.current.set(activeScene.id, JSON.stringify(activeScene))
      lastKnownServerModifiedAtRef.current.set(activeScene.id, activeScene.modifiedAt)
      persistedSceneIdsRef.current.add(activeScene.id) // Mark as persisted

      // Clear conflict state
      clearConflict()
      setSaveStatus('saved')
    } catch (error) {
      console.error('Failed to save local scene:', error)
      setSaveStatus('error')
      alert('Failed to save your local version. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }, [activeScene, clearConflict])

  // Conflict resolution: Fork (create new scene with local content)
  const handleFork = useCallback(async () => {
    if (!activeScene || !activeSceneId) return

    try {
      // Create new scene with local content and new ID
      const now = new Date().toISOString()
      const forkedScene: Scene = {
        ...activeScene,
        id: uuidv4(),
        name: `${activeScene.name} (copy)`,
        createdAt: now,
        modifiedAt: now,
      }

      // Get current history for the forked scene
      const currentHistory = historyMap.get(activeSceneId)
      const forkedHistory = currentHistory ? currentHistory.clone() : new HistoryStack()

      // Load the remote version into the original scene (so it stays in sync)
      const remoteScene = await loadScene(activeSceneId)
      let remoteHistory: HistoryStack
      try {
        const serializedHistory = await loadHistory(activeSceneId)
        remoteHistory = HistoryStack.deserialize(serializedHistory)
        lastSavedHistoryRef.current.set(activeSceneId, JSON.stringify(serializedHistory))
      } catch {
        remoteHistory = new HistoryStack()
      }

      // Update the original scene with remote data and add the forked scene
      setOpenScenes((prev) => [
        ...prev.map((scene) => (scene.id === activeSceneId ? remoteScene : scene)),
        forkedScene,
      ])
      lastSavedRef.current.set(activeSceneId, JSON.stringify(remoteScene))
      lastKnownServerModifiedAtRef.current.set(activeSceneId, remoteScene.modifiedAt)
      persistedSceneIdsRef.current.add(activeSceneId) // Mark original as persisted (loaded from server)
      lastSavedRef.current.set(forkedScene.id, '') // Mark fork as needing save
      // Forked scene has no server timestamp yet - it will be set on first save
      // Note: forkedScene.id is NOT added to persistedSceneIdsRef - it's a new local scene

      // Update history for both scenes
      setHistoryMap((prev) => {
        const newMap = new Map(prev)
        newMap.set(activeSceneId, remoteHistory)
        newMap.set(forkedScene.id, forkedHistory)
        return newMap
      })
      setHistoryVersion((v) => v + 1)

      // Initialize empty selection for forked scene, clear selection on original
      setSelectionMap((prev) => {
        const newMap = new Map(prev)
        newMap.set(activeSceneId, [])
        newMap.set(forkedScene.id, [])
        return newMap
      })

      // Switch to the forked scene
      setActiveSceneId(forkedScene.id)

      // Clear conflict state (no longer applies to the new scene)
      clearConflict()
    } catch (error) {
      console.error('Failed to fork scene:', error)
      alert('Failed to create a copy of the scene. Please try again.')
    }
  }, [activeScene, activeSceneId, historyMap, clearConflict])

  // Trigger remote check when opening scenes
  useEffect(() => {
    if (activeSceneId && !isLoading) {
      checkRemoteChanges()
    }
  }, [activeSceneId, isLoading, checkRemoteChanges])

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

              try {
                startOperation()
                const s3Url = await uploadImage(dataUrl, fileName || `dropped-${Date.now()}.png`)
                endOperation()
                addImageAt(centerX + offsetIndex * 20, centerY + offsetIndex * 20, s3Url, width, height, name, originalWidth, originalHeight, fileSize)
              } catch (err) {
                endOperation()
                console.error('Failed to upload image:', err)
                addImageAt(centerX + offsetIndex * 20, centerY + offsetIndex * 20, dataUrl, width, height, name, originalWidth, originalHeight, fileSize)
              }
            }
            img.src = dataUrl
          }
          reader.readAsDataURL(file)
          offsetIndex++
        } else if (file.type.startsWith('video/')) {
          try {
            const dimensions = await getVideoDimensions(file)
            startOperation()
            const url = await uploadVideo(file, isOffline)
            endOperation()
            const name = file.name.replace(/\.[^/.]+$/, '')
            addVideoAt(centerX + offsetIndex * 20, centerY + offsetIndex * 20, url, dimensions.width, dimensions.height, name, dimensions.fileSize)
            offsetIndex++
          } catch (err) {
            console.error('Video upload failed:', err)
            endOperation()
          }
        }
      }
    }

    processFiles()
  }, [activeSceneId, isOffline, startOperation, endOperation, addImageAt, addVideoAt])

  if (isLoading) {
    return (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading scenes...
      </div>
    )
  }

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <MenuBar
        onAddText={addTextItem}
        onAddImage={addImageItem}
        onAddVideo={handleAddVideo}
        onAddPrompt={addPromptItem}
        onAddImageGenPrompt={addImageGenPromptItem}
        onAddHtmlGenPrompt={addHtmlGenPromptItem}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
        onNewScene={addScene}
        onOpenScene={handleOpenSceneDialog}
        onExportScene={handleExportScene}
        onImportSceneFromZip={handleImportFromZip}
        onImportSceneFromFolder={handleImportFromFolder}
        onGetSceneJson={() => activeScene ? JSON.stringify(activeScene, null, 2) : '{}'}
        onGetServerSceneJson={async () => {
          if (!activeSceneId) return '{}'
          try {
            const response = await fetch(`/api/scenes/${activeSceneId}/raw`)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const text = await response.text()
            // Pretty-print if it's valid JSON
            try {
              return JSON.stringify(JSON.parse(text), null, 2)
            } catch {
              return text
            }
          } catch (err) {
            return `Error: ${err}`
          }
        }}
        onGetHistoryJson={() => activeHistory ? JSON.stringify(activeHistory.serialize(), null, 2) : '{}'}
        onClearHistory={() => {
          if (activeSceneId) {
            setHistoryMap((prev) => {
              const newMap = new Map(prev)
              newMap.set(activeSceneId, new HistoryStack())
              return newMap
            })
            setHistoryVersion((v) => v + 1)
          }
        }}
        onOpenSettings={() => setSettingsDialogOpen(true)}
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
          selectedIds={selectedIds}
          sceneId={activeSceneId || ''}
          onUpdateItem={updateItem}
          onSelectItems={selectItems}
          onAddTextAt={addTextAt}
          onAddImageAt={addImageAt}
          onAddVideoAt={addVideoAt}
          onDeleteSelected={deleteSelected}
          onRunPrompt={handleRunPrompt}
          runningPromptIds={runningPromptIds}
          onRunImageGenPrompt={handleRunImageGenPrompt}
          runningImageGenPromptIds={runningImageGenPromptIds}
          onRunHtmlGenPrompt={handleRunHtmlGenPrompt}
          runningHtmlGenPromptIds={runningHtmlGenPromptIds}
          isOffline={isOffline}
          onAddText={addTextItem}
          onAddPrompt={addPromptItem}
          onAddImageGenPrompt={addImageGenPromptItem}
          onAddHtmlGenPrompt={addHtmlGenPromptItem}
        />
      ) : (
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888' }}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={async (e) => {
            e.preventDefault()
            const files = Array.from(e.dataTransfer.files)
            const mediaFiles = files.filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'))
            if (mediaFiles.length === 0) return

            // Store files and create a new scene
            pendingDropFilesRef.current = mediaFiles
            await addScene()
          }}
        >
          <div>No scene open. Use File &gt; Open Scene... to open a scene, or click + to create a new one.</div>
          <div style={{ fontSize: '0.9em', marginTop: '8px' }}>Or drag and drop images/videos here to create a new scene.</div>
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
        saveStatus={saveStatus}
        isOffline={isOffline}
        onSetOfflineMode={handleSetOfflineMode}
        backgroundOperationsCount={backgroundOpsCount}
        storageMode={storageMode}
        onOpenSettings={() => setSettingsDialogOpen(true)}
        onStorageModeSync={handleStorageModeSync}
        onStorageModeChange={handleStorageModeChange}
      />
      <OpenSceneDialog
        isOpen={openSceneDialogOpen}
        scenes={availableScenes}
        openSceneIds={openScenes.map((s) => s.id)}
        onOpen={handleOpenScenes}
        onCancel={() => setOpenSceneDialogOpen(false)}
      />
      <ConflictDialog
        isOpen={hasConflict}
        sceneName={activeScene?.name ?? ''}
        localModifiedAt={activeScene?.modifiedAt ?? ''}
        remoteModifiedAt={remoteModifiedAt ?? ''}
        onGetRemote={handleGetRemote}
        onKeepLocal={handleKeepLocal}
        onFork={handleFork}
        onCancel={clearConflict}
      />
      <SettingsDialog
        isOpen={settingsDialogOpen}
        onClose={() => setSettingsDialogOpen(false)}
        onStorageModeChange={handleStorageModeChange}
      />
    </div>
  )
}

export default App
