import { useState, useCallback } from 'react'
import { listScenes, isOfflineMode } from '../api/scenes'
import { isOfflineSplashDismissed } from '../components/OfflineSplashDialog'
import type { SceneInfo } from '../components/OpenSceneDialog'

export function useDialogManager() {
  const [openSceneDialogOpen, setOpenSceneDialogOpen] = useState(false)
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [newWorkspaceDialogOpen, setNewWorkspaceDialogOpen] = useState(false)
  const [switchWorkspaceDialogOpen, setSwitchWorkspaceDialogOpen] = useState(false)
  const [offlineSplashOpen, setOfflineSplashOpen] = useState(() => isOfflineMode() && !isOfflineSplashDismissed())
  const [debugPanelOpen, setDebugPanelOpen] = useState(false)
  const [debugContent, setDebugContent] = useState('')
  const [availableScenes, setAvailableScenes] = useState<SceneInfo[]>([])

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

  // Create a new workspace
  const handleCreateWorkspace = useCallback(async (name: string, hidden: boolean) => {
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, hidden }),
      })
      const data = await response.json()
      if (!response.ok) {
        alert(data.error || 'Failed to create workspace')
        return
      }
      setNewWorkspaceDialogOpen(false)
      // Navigate to the new workspace
      window.location.href = `/${name}/`
    } catch (error) {
      console.error('Failed to create workspace:', error)
      alert('Failed to create workspace')
    }
  }, [])

  const handleSwitchWorkspace = useCallback((name: string) => {
    window.location.href = `/${name}/`
  }, [])

  return {
    openSceneDialogOpen, setOpenSceneDialogOpen, availableScenes,
    settingsDialogOpen, setSettingsDialogOpen,
    newWorkspaceDialogOpen, setNewWorkspaceDialogOpen,
    switchWorkspaceDialogOpen, setSwitchWorkspaceDialogOpen,
    offlineSplashOpen, setOfflineSplashOpen,
    debugPanelOpen, setDebugPanelOpen,
    debugContent, setDebugContent,
    handleOpenSceneDialog, handleCreateWorkspace, handleSwitchWorkspace,
  }
}
