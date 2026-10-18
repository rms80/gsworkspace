import { Router } from 'express'
import { getStorageMode, setStorageMode, StorageMode } from '../services/storage.js'
import { getStoragePath, initializeStorage } from '../services/diskStorage.js'
import { getLlmCapabilities } from '../services/llmRegistry.js'

const router = Router()

// Get current configuration
// GET /api/config
router.get('/', (_req, res) => {
  const storageMode = getStorageMode()

  res.json({
    storageMode,
    // Include storage path info only in local mode
    ...(storageMode === 'local' && {
      localStoragePath: getStoragePath(),
    }),
  })
})

// What the server's LLM features can run now: available models, defaults, and CLI/API status
// GET /api/config/llm
router.get('/llm', async (_req, res) => {
  try {
    res.json(await getLlmCapabilities())
  } catch (error) {
    console.error('Error getting LLM capabilities:', error)
    res.status(500).json({ error: 'Failed to get LLM capabilities' })
  }
})

// Change storage mode at runtime
// POST /api/config/storage-mode
router.post('/storage-mode', async (req, res) => {
  try {
    const { mode } = req.body

    if (!mode || !['online', 'local'].includes(mode)) {
      return res.status(400).json({
        error: 'Invalid storage mode. Must be "online" or "local"',
      })
    }

    const newMode = mode as StorageMode

    // If switching to local mode, ensure storage directory exists
    if (newMode === 'local') {
      await initializeStorage()
    }

    setStorageMode(newMode)

    res.json({
      success: true,
      storageMode: newMode,
      ...(newMode === 'local' && {
        localStoragePath: getStoragePath(),
      }),
    })
  } catch (error) {
    console.error('Error changing storage mode:', error)
    res.status(500).json({ error: 'Failed to change storage mode' })
  }
})

export default router
