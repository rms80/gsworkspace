export interface Point {
  x: number
  y: number
}

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

export interface BaseItem {
  id: string
  x: number
  y: number
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
  cropRect?: CropRect
  cropSrc?: string
}

export interface VideoItem extends BaseItem {
  type: 'video'
  src: string
  name?: string     // editable label displayed in header
  width: number
  height: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  loop?: boolean       // default false
  muted?: boolean      // default true
  playbackRate?: number // default 1 (0.5, 1, 1.5, 2, 3)
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

export interface HtmlItem extends BaseItem {
  type: 'html'
  label: string
  html: string
  width: number
  height: number
  zoom?: number  // default 1.0
}

export interface HTMLGenPromptItem extends BaseItem {
  type: 'html-gen-prompt'
  label: string
  text: string
  fontSize: number
  width: number
  height: number
  model: LLMModel
}

export type CanvasItem = TextItem | ImageItem | VideoItem | PromptItem | ImageGenPromptItem | HtmlItem | HTMLGenPromptItem

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
