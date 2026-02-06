import { Router } from 'express'
import { save, exists } from '../services/storage.js'

const WORKSPACE_RE = /^[a-zA-Z0-9_-]{1,64}$/

const router = Router()

// Create a new workspace
router.post('/', async (req, res) => {
  try {
    const { name, hidden } = req.body

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Workspace name is required' })
    }

    if (!WORKSPACE_RE.test(name)) {
      return res.status(400).json({ error: 'Invalid workspace name. Must be 1-64 alphanumeric, hyphen, or underscore characters.' })
    }

    // Check if workspace already exists
    const workspaceKey = `${name}/workspace.json`
    if (await exists(workspaceKey)) {
      return res.status(409).json({ error: 'Workspace already exists' })
    }

    const createdAt = new Date().toISOString()
    const metadata = {
      name,
      hidden: !!hidden,
      createdAt,
    }

    await save(workspaceKey, Buffer.from(JSON.stringify(metadata, null, 2)), 'application/json')

    res.json({ success: true, workspace: metadata })
  } catch (error) {
    console.error('Error creating workspace:', error)
    res.status(500).json({ error: 'Failed to create workspace' })
  }
})

export default router
