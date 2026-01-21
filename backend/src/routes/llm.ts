import { Router } from 'express'
import { generateText, ClaudeModel } from '../services/claude.js'
import { generateTextWithGemini, GeminiModel } from '../services/gemini.js'

const router = Router()

type LLMModel = ClaudeModel | GeminiModel

interface ContentItem {
  type: 'text' | 'image'
  text?: string
  src?: string
}

function isClaudeModel(model: string): model is ClaudeModel {
  return model.startsWith('claude-')
}

function isGeminiModel(model: string): model is GeminiModel {
  return model.startsWith('gemini-')
}

router.post('/generate', async (req, res) => {
  try {
    const { items, prompt, model } = req.body as { items: ContentItem[]; prompt: string; model?: LLMModel }

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' })
    }

    const selectedModel = model || 'claude-sonnet'
    let result: string

    if (isGeminiModel(selectedModel)) {
      result = await generateTextWithGemini(items, prompt, selectedModel)
    } else if (isClaudeModel(selectedModel)) {
      result = await generateText(items, prompt, selectedModel)
    } else {
      return res.status(400).json({ error: `Unknown model: ${selectedModel}` })
    }

    res.json({ result })
  } catch (error) {
    console.error('Error generating text:', error)
    res.status(500).json({ error: 'Failed to generate text' })
  }
})

export default router
