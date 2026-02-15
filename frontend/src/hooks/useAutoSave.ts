import { useState, useEffect, useRef } from 'react'
import { saveScene, getSceneTimestamp, saveHistory } from '../api/scenes'
import type { SaveStatus } from '../components/StatusBar'
import type { Scene } from '../types'
import type { HistoryStack } from '../history'

interface UseAutoSaveDeps {
  activeScene: Scene | undefined
  activeSceneId: string | null
  isLoading: boolean
  isOffline: boolean
  historyMap: Map<string, HistoryStack>
  historyVersion: number
  lastSavedRef: React.MutableRefObject<Map<string, string>>
  lastSavedHistoryRef: React.MutableRefObject<Map<string, string>>
  lastKnownServerModifiedAtRef: React.MutableRefObject<Map<string, string>>
  persistedSceneIdsRef: React.MutableRefObject<Set<string>>
  setIsSaving: (saving: boolean) => void
  setConflict: (remoteModifiedAt: string) => void
}

export function useAutoSave({
  activeScene, activeSceneId, isLoading, isOffline,
  historyMap, historyVersion,
  lastSavedRef, lastSavedHistoryRef, lastKnownServerModifiedAtRef, persistedSceneIdsRef,
  setIsSaving, setConflict,
}: UseAutoSaveDeps) {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const saveTimeoutRef = useRef<number | null>(null)
  const historySaveTimeoutRef = useRef<number | null>(null)

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

  return { saveStatus, setSaveStatus }
}
