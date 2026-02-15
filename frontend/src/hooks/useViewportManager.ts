import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { loadViewports, saveViewports, ViewportState } from '../utils/settings'
import { getStorageMode, StorageMode } from '../api/scenes'
import type { CanvasHandle } from '../components/InfiniteCanvas'

interface UseViewportManagerDeps {
  activeSceneId: string | null
  isLoading: boolean
  storageMode: StorageMode
  canvasRef: React.RefObject<CanvasHandle | null>
}

export function useViewportManager({ activeSceneId, isLoading, storageMode, canvasRef }: UseViewportManagerDeps) {
  const viewportMapRef = useRef<Map<string, ViewportState>>((() => {
    const saved = loadViewports(getStorageMode())
    const map = new Map<string, ViewportState>()
    for (const [id, vp] of Object.entries(saved)) {
      map.set(id, vp)
    }
    return map
  })())
  const prevActiveSceneIdRef = useRef<string | null>(null)

  // Save/restore viewport on tab switch (useLayoutEffect runs before paint, avoiding flicker)
  useLayoutEffect(() => {
    if (isLoading) return
    const prevId = prevActiveSceneIdRef.current

    // Save previous scene's viewport
    if (prevId && prevId !== activeSceneId && canvasRef.current) {
      const vp = canvasRef.current.getViewport()
      viewportMapRef.current.set(prevId, vp)
    }

    // Restore new scene's viewport (also restores on HMR re-mount when prevId === activeSceneId)
    if (activeSceneId) {
      const saved = viewportMapRef.current.get(activeSceneId)
      if (saved && canvasRef.current) {
        canvasRef.current.setViewport({ x: saved.x, y: saved.y }, saved.scale)
      }
    }

    prevActiveSceneIdRef.current = activeSceneId
  }, [activeSceneId, isLoading])

  // Periodic viewport save to localStorage (every 5s) + beforeunload
  useEffect(() => {
    const saveCurrentViewport = () => {
      if (activeSceneId && canvasRef.current) {
        viewportMapRef.current.set(activeSceneId, canvasRef.current.getViewport())
      }
      // Convert map to record for persistence
      const record: Record<string, ViewportState> = {}
      viewportMapRef.current.forEach((vp, id) => {
        record[id] = vp
      })
      saveViewports(record, storageMode)
    }

    const interval = setInterval(saveCurrentViewport, 5000)
    window.addEventListener('beforeunload', saveCurrentViewport)

    return () => {
      clearInterval(interval)
      window.removeEventListener('beforeunload', saveCurrentViewport)
      saveCurrentViewport()
    }
  }, [activeSceneId, storageMode])

  // Helper: delete a single viewport entry
  const deleteViewport = useCallback((id: string) => {
    viewportMapRef.current.delete(id)
  }, [])

  // Helper: clear all viewport entries
  const clearViewports = useCallback(() => {
    viewportMapRef.current.clear()
  }, [])

  // Helper: reload viewports from settings for a given mode
  const reloadViewports = useCallback((mode: StorageMode) => {
    const savedViewports = loadViewports(mode)
    viewportMapRef.current.clear()
    for (const [id, vp] of Object.entries(savedViewports)) {
      viewportMapRef.current.set(id, vp)
    }
  }, [])

  return { deleteViewport, clearViewports, reloadViewports }
}
