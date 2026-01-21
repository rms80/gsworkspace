import { Router } from 'express'
import { saveToS3, loadFromS3, listFromS3 } from '../services/s3.js'
import { v4 as uuidv4 } from 'uuid'

const router = Router()

// Save canvas state
router.post('/save', async (req, res) => {
  try {
    const { items } = req.body
    const id = uuidv4()
    await saveToS3(`canvas/${id}.json`, JSON.stringify(items))
    res.json({ success: true, id })
  } catch (error) {
    console.error('Error saving items:', error)
    res.status(500).json({ error: 'Failed to save items' })
  }
})

// Load canvas state
router.get('/load/:id', async (req, res) => {
  try {
    const data = await loadFromS3(`canvas/${req.params.id}.json`)
    if (!data) {
      return res.status(404).json({ error: 'Not found' })
    }
    res.json(JSON.parse(data))
  } catch (error) {
    console.error('Error loading items:', error)
    res.status(500).json({ error: 'Failed to load items' })
  }
})

// List all saved canvases
router.get('/list', async (_req, res) => {
  try {
    const files = await listFromS3('canvas/')
    res.json(files)
  } catch (error) {
    console.error('Error listing items:', error)
    res.status(500).json({ error: 'Failed to list items' })
  }
})

// Upload image
router.post('/upload-image', async (req, res) => {
  try {
    const { imageData, filename } = req.body
    const id = uuidv4()
    const key = `images/${id}-${filename}`

    // imageData is base64, convert to buffer
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '')
    await saveToS3(key, Buffer.from(base64Data, 'base64'), 'image/png')

    // Return the S3 URL (for public bucket)
    const bucketName = process.env.S3_BUCKET_NAME
    const region = process.env.AWS_REGION || 'us-east-1'
    const url = `https://${bucketName}.s3.${region}.amazonaws.com/${key}`

    res.json({ success: true, url })
  } catch (error) {
    console.error('Error uploading image:', error)
    res.status(500).json({ error: 'Failed to upload image' })
  }
})

export default router
