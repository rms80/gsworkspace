export interface Point {
  x: number
  y: number
}

export interface BaseItem {
  id: string
  x: number
  y: number
  selected?: boolean
}

export interface TextItem extends BaseItem {
  type: 'text'
  text: string
  fontSize: number
  width: number
  height: number
}

export interface ImageItem extends BaseItem {
  type: 'image'
  src: string
  width: number
  height: number
  scaleX?: number
  scaleY?: number
  rotation?: number
}

export type LLMModel = 'claude-haiku' | 'claude-sonnet' | 'claude-opus' | 'gemini-flash' | 'gemini-pro'

export type ImageGenModel = 'gemini-imagen' | 'gemini-flash-imagen'

export interface PromptItem extends BaseItem {
  type: 'prompt'
  label: string
  text: string
  fontSize: number
  width: number
  height: number
  model: LLMModel
}

export interface ImageGenPromptItem extends BaseItem {
  type: 'image-gen-prompt'
  label: string
  text: string
  fontSize: number
  width: number
  height: number
  model: ImageGenModel
}

export type CanvasItem = TextItem | ImageItem | PromptItem | ImageGenPromptItem

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Scene {
  id: string
  name: string
  items: CanvasItem[]
  createdAt: string
  modifiedAt: string
}
