import { Router } from 'express'
import { save, exists, list, load } from '../services/storage.js'

const WORKSPACE_RE = /^[a-zA-Z0-9_-]{1,64}$/

const router = Router()

// List all non-hidden workspaces
router.get('/', async (_req, res) => {
  try {
    const keys = await list('')

    // Collect workspaces that have a workspace.json
    const seen = new Set<string>()
    const workspaces: Array<{ name: string; createdAt: string }> = []
    const workspaceKeys = keys.filter((k: string) => k.endsWith('/workspace.json'))

    for (const key of workspaceKeys) {
      try {
        const raw = await load(key)
        if (!raw) continue
        const meta = JSON.parse(raw)
        seen.add(meta.name)
        if (meta.hidden) continue
        workspaces.push({ name: meta.name, createdAt: meta.createdAt })
      } catch {
        // Skip malformed workspace metadata
      }
    }

    // Also discover workspace folders that have scene content but no workspace.json
    // (e.g. the original default workspace that predates the workspace feature)
    const folderNames = new Set<string>()
    for (const key of keys) {
      const slashIdx = key.indexOf('/')
      if (slashIdx > 0) {
        folderNames.add(key.substring(0, slashIdx))
      }
    }
    for (const folder of folderNames) {
      if (seen.has(folder)) continue
      // Check that it has at least one scene.json (real workspace content)
      const hasScene = keys.some((k: string) => k.startsWith(`${folder}/`) && k.endsWith('/scene.json'))
      if (hasScene) {
        workspaces.push({ name: folder, createdAt: '' })
      }
    }

    res.json(workspaces)
  } catch (error) {
    console.error('Error listing workspaces:', error)
    res.status(500).json({ error: 'Failed to list workspaces' })
  }
})

// Check if a workspace exists
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params

    if (!WORKSPACE_RE.test(name)) {
      return res.status(400).json({ error: 'Invalid workspace name' })
    }

    // Check for workspace.json first
    if (await exists(`${name}/workspace.json`)) {
      return res.json({ exists: true })
    }

    // Also check if the folder has any content (workspace predates workspace.json)
    const keys = await list(`${name}/`)
    res.json({ exists: keys.length > 0 })
  } catch (error) {
    console.error('Error checking workspace:', error)
    res.status(500).json({ error: 'Failed to check workspace' })
  }
})

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
