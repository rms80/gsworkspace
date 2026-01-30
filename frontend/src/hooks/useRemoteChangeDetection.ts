import { useState, useEffect, useCallback, useRef } from 'react'
import { getSceneTimestamp } from '../api/scenes'

interface UseRemoteChangeDetectionProps {
  sceneId: string | null
  lastKnownServerModifiedAt: string | null
  isOffline: boolean
  isSaving: boolean
}

interface UseRemoteChangeDetectionResult {
  hasConflict: boolean
  remoteModifiedAt: string | null
  checkNow: () => Promise<boolean>
  clearConflict: () => void
  setConflict: (remoteModifiedAt: string) => void
}

const POLL_INTERVAL_MS = 30000 // 30 seconds

export function useRemoteChangeDetection({
  sceneId,
  lastKnownServerModifiedAt,
  isOffline,
  isSaving,
}: UseRemoteChangeDetectionProps): UseRemoteChangeDetectionResult {
  const [hasConflict, setHasConflict] = useState(false)
  const [remoteModifiedAt, setRemoteModifiedAt] = useState<string | null>(null)
  const pollIntervalRef = useRef<number | null>(null)
  const lastCheckedSceneIdRef = useRef<string | null>(null)

  const checkForChanges = useCallback(async (): Promise<boolean> => {
    // Skip checks if:
    // - No scene is active
    // - In offline mode (no server to check)
    // - Currently saving (avoid race conditions)
    // - No known server timestamp to compare against
    if (!sceneId || isOffline || isSaving || !lastKnownServerModifiedAt) {
      return false
    }

    try {
      const timestamp = await getSceneTimestamp(sceneId)
      if (!timestamp) {
        // Scene doesn't exist or fetch failed - no conflict
        return false
      }

      // Compare remote timestamp with what we last knew the server had
      if (timestamp.modifiedAt !== lastKnownServerModifiedAt) {
        // Remote version has changed since we last loaded/saved
        setHasConflict(true)
        setRemoteModifiedAt(timestamp.modifiedAt)
        return true
      }
      return false
    } catch (error) {
      // Network errors - fail silently to avoid disrupting user
      console.error('Failed to check for remote changes:', error)
      return false
    }
  }, [sceneId, lastKnownServerModifiedAt, isOffline, isSaving])

  // Check immediately when scene changes
  useEffect(() => {
    if (sceneId !== lastCheckedSceneIdRef.current) {
      lastCheckedSceneIdRef.current = sceneId
      // Clear any existing conflict when switching scenes
      setHasConflict(false)
      setRemoteModifiedAt(null)
      // Check the new scene
      checkForChanges()
    }
  }, [sceneId, checkForChanges])

  // Set up polling interval
  useEffect(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    // Don't poll if no scene or in offline mode
    if (!sceneId || isOffline) {
      return
    }

    // Start polling
    pollIntervalRef.current = window.setInterval(checkForChanges, POLL_INTERVAL_MS)

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [sceneId, isOffline, checkForChanges])

  // Handle tab visibility changes - check when tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForChanges()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [checkForChanges])

  const clearConflict = useCallback(() => {
    setHasConflict(false)
    setRemoteModifiedAt(null)
  }, [])

  const setConflict = useCallback((remoteTimestamp: string) => {
    setHasConflict(true)
    setRemoteModifiedAt(remoteTimestamp)
  }, [])

  return {
    hasConflict,
    remoteModifiedAt,
    checkNow: checkForChanges,
    clearConflict,
    setConflict,
  }
}
