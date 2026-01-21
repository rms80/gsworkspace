import { Router } from 'express'
import { generateText } from '../services/claude.js'

const router = Router()

interface ContentItem {
  type: 'text' | 'image'
  text?: string
  src?: string
}

router.post('/generate', async (req, res) => {
  try {
    const { items, prompt } = req.body as { items: ContentItem[]; prompt: string }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const result = await generateText(items, prompt)
    res.json({ result })
  } catch (error) {
    console.error('Error generating text:', error)
    res.status(500).json({ error: 'Failed to generate text' })
  }
})

export default router
