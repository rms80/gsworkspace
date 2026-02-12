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
  name?: string           // editable label displayed in header
  width: number
  height: number
  originalWidth?: number  // original pixel dimensions
  originalHeight?: number
  fileSize?: number       // file size in bytes
  scaleX?: number
  scaleY?: number
  rotation?: number
  cropRect?: CropRect
  cropSrc?: string
  cropSrcFileSize?: number  // file size of cropped version in bytes
}

export interface VideoItem extends BaseItem {
  type: 'video'
  src: string
  name?: string     // editable label displayed in header
  width: number
  height: number
  originalWidth?: number  // original pixel dimensions
  originalHeight?: number
  fileSize?: number       // file size in bytes
  scaleX?: number
  scaleY?: number
  rotation?: number
  loop?: boolean       // default false
  muted?: boolean      // default true
  playbackRate?: number // default 1 (0.5, 1, 1.5, 2, 3)
  cropRect?: CropRect   // crop region in source video pixels
  cropSrc?: string      // S3 URL of cropped video file
  cropSrcFileSize?: number  // file size of cropped version in bytes
  speedFactor?: number  // encoded speed multiplier (0.25, 0.5, 1, 1.5, 2, 3, 4)
  removeAudio?: boolean // remove audio track from encoded video
  trim?: boolean        // whether trim is enabled
  trimStart?: number    // trim start time in seconds (fractional)
  trimEnd?: number      // trim end time in seconds (fractional)
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

export interface PdfItem extends BaseItem {
  type: 'pdf'
  src: string
  name?: string
  width: number
  height: number
  fileSize?: number
  minimized?: boolean
}

export type CanvasItem = TextItem | ImageItem | VideoItem | PromptItem | ImageGenPromptItem | HtmlItem | HTMLGenPromptItem | PdfItem

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

export const SCENE_FILE_VERSION = '1'

export interface Scene {
  id: string
  name: string
  items: CanvasItem[]
  createdAt: string
  modifiedAt: string
  version?: string
}
