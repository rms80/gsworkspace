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

export type LLMModel =
  | 'claude-haiku' | 'claude-sonnet' | 'claude-opus'
  | 'gpt-luna' | 'gpt-sol' | 'gpt-astra'
  | 'gemini-flash' | 'gemini-pro'

export type ImageGenModel = 'codex-imagen' | 'gemini-imagen' | 'gemini-flash-imagen'

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

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
}

export interface ActivityMessage {
  id: string
  type: 'tool_use' | 'tool_result' | 'assistant_text' | 'status' | 'error'
  content: string
  timestamp: string
}

export type CodingAgent = 'claude-code' | 'codex'
export type AgentPermissions = 'safe' | 'full'

export interface CodingRobotItem extends BaseItem {
  type: 'coding-robot'
  label: string
  text: string
  fontSize: number
  width: number
  height: number
  /** Conversation from the retired Agent SDK integration; shown read-only until a new session starts */
  chatHistory: ChatMessage[]
  /** Agent SDK session id from the retired integration (unused) */
  sessionId: string | null
  /** Backend agent session (see backend/src/services/agentSessions.ts); created on the first message */
  agentSessionId?: string | null
  agent?: CodingAgent           // default 'claude-code'
  agentModel?: LLMModel | null  // null: the CLI's default model
  permissions?: AgentPermissions // default 'safe'
  /** The session's working directory on the server; empty for a folder of its own */
  rootDirectory?: string
  showActivity?: boolean
  activityPanelWidth?: number  // canvas units (unscaled)
  activeRequestId?: string     // retired
}

export interface PdfItem extends BaseItem {
  type: 'pdf'
  src: string
  name?: string
  width: number
  height: number
  fileSize?: number
  minimized?: boolean
  thumbnailSrc?: string
}

export type TextFileFormat = 'txt' | 'csv' | 'js' | 'ts' | 'tsx' | 'cs' | 'cpp' | 'h' | 'c' | 'json' | 'py' | 'md' | 'sh' | 'log' | 'ini'

export type TextFileViewType = 'raw' | 'table' | 'markdown'

export interface TextFileItem extends BaseItem {
  type: 'text-file'
  src: string
  name?: string
  width: number
  height: number
  fileSize?: number
  minimized?: boolean
  fileFormat: TextFileFormat
  fontMono?: boolean
  fontSize?: number
  viewType?: TextFileViewType
}

export type Model3DFormat = 'glb' | 'gltf' | 'obj' | 'stl' | 'fbx'

export interface Model3DItem extends BaseItem {
  type: 'model3d'
  src: string
  name?: string
  width: number
  height: number
  fileSize?: number
  format: Model3DFormat
  minimized?: boolean
  cameraPosition?: [number, number, number]
  cameraTarget?: [number, number, number]
}

export type SplatFormat = 'splat' | 'ksplat' | 'ply'

export interface SplatItem extends BaseItem {
  type: 'splat'
  src: string
  name?: string
  width: number
  height: number
  fileSize?: number
  format: SplatFormat
  minimized?: boolean
  cameraPosition?: [number, number, number]
  cameraTarget?: [number, number, number]
  cameraUp?: [number, number, number]
  orthographic?: boolean
}

export type EmbedVideoProvider = 'youtube'

export interface EmbedVideoItem extends BaseItem {
  type: 'embed-video'
  videoId: string
  provider: EmbedVideoProvider
  label: string
  width: number
  height: number
  startTime?: number  // seconds offset for playback start
}

export type CanvasItem = TextItem | ImageItem | VideoItem | PromptItem | ImageGenPromptItem | HtmlItem | HTMLGenPromptItem | CodingRobotItem | PdfItem | TextFileItem | EmbedVideoItem | Model3DItem | SplatItem

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
