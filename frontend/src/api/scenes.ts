import { Scene } from '../types'

const API_BASE = '/api/scenes'

export interface SceneMetadata {
  id: string
  name: string
  createdAt: string
  modifiedAt: string
  itemCount: number
}

export async function saveScene(scene: Scene): Promise<void> {
  const response = await fetch(`${API_BASE}/${scene.id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scene),
  })
  if (!response.ok) {
    throw new Error(`Failed to save scene: ${response.statusText}`)
  }
}

export async function loadScene(id: string): Promise<Scene> {
  const response = await fetch(`${API_BASE}/${id}`)
  if (!response.ok) {
    throw new Error(`Failed to load scene: ${response.statusText}`)
  }
  return response.json()
}

export async function listScenes(): Promise<SceneMetadata[]> {
  const response = await fetch(API_BASE)
  if (!response.ok) {
    throw new Error(`Failed to list scenes: ${response.statusText}`)
  }
  return response.json()
}
