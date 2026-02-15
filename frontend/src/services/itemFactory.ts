import { v4 as uuidv4 } from 'uuid'
import type {
  TextItem,
  PromptItem,
  ImageGenPromptItem,
  HTMLGenPromptItem,
  CodingRobotItem,
  ImageItem,
  VideoItem,
  PdfItem,
  TextFileItem,
  TextFileFormat,
} from '../types'

interface Pos {
  x: number
  y: number
}

// ---------------------------------------------------------------------------
// Toolbar-created items (generate their own id)
// ---------------------------------------------------------------------------

export function createTextItem(
  pos: Pos,
  opts?: { text?: string; width?: number; height?: number },
): TextItem {
  return {
    id: uuidv4(),
    type: 'text',
    ...pos,
    text: opts?.text ?? 'Double-click to edit',
    fontSize: 14,
    width: opts?.width ?? 200,
    height: opts?.height ?? 100,
  }
}

export function createPromptItem(
  pos: Pos,
  opts?: { label?: string; text?: string; model?: PromptItem['model']; width?: number; height?: number },
): PromptItem {
  return {
    id: uuidv4(),
    type: 'prompt',
    ...pos,
    label: opts?.label ?? 'Prompt',
    text: opts?.text ?? 'Enter your prompt here...',
    fontSize: 14,
    width: opts?.width ?? 300,
    height: opts?.height ?? 150,
    model: opts?.model ?? 'claude-sonnet',
  }
}

export function createImageGenPromptItem(
  pos: Pos,
  opts?: { label?: string; text?: string; model?: ImageGenPromptItem['model']; width?: number; height?: number },
): ImageGenPromptItem {
  return {
    id: uuidv4(),
    type: 'image-gen-prompt',
    ...pos,
    label: opts?.label ?? 'Image Gen',
    text: opts?.text ?? 'Describe the image you want to generate...',
    fontSize: 14,
    width: opts?.width ?? 300,
    height: opts?.height ?? 150,
    model: opts?.model ?? 'gemini-imagen',
  }
}

export function createHtmlGenPromptItem(
  pos: Pos,
  opts?: { label?: string; text?: string; model?: HTMLGenPromptItem['model']; width?: number; height?: number },
): HTMLGenPromptItem {
  return {
    id: uuidv4(),
    type: 'html-gen-prompt',
    ...pos,
    label: opts?.label ?? 'HTML Gen',
    text: opts?.text ?? 'create a professional-looking tutorial page for this content',
    fontSize: 14,
    width: opts?.width ?? 300,
    height: opts?.height ?? 150,
    model: opts?.model ?? 'claude-sonnet',
  }
}

export function createCodingRobotItem(
  pos: Pos,
  opts?: { label?: string; width?: number; height?: number },
): CodingRobotItem {
  return {
    id: uuidv4(),
    type: 'coding-robot',
    ...pos,
    label: opts?.label ?? 'Coding Robot',
    text: '',
    fontSize: 14,
    width: opts?.width ?? 400,
    height: opts?.height ?? 350,
    chatHistory: [],
    sessionId: null,
  }
}

// ---------------------------------------------------------------------------
// File-drop / upload items (id provided externally)
// ---------------------------------------------------------------------------

export function createImageItem(
  id: string,
  pos: Pos,
  src: string,
  width: number,
  height: number,
  opts?: { name?: string; originalWidth?: number; originalHeight?: number; fileSize?: number },
): ImageItem {
  return {
    id,
    type: 'image',
    ...pos,
    src,
    width,
    height,
    ...(opts?.name != null && { name: opts.name }),
    ...(opts?.originalWidth != null && { originalWidth: opts.originalWidth }),
    ...(opts?.originalHeight != null && { originalHeight: opts.originalHeight }),
    ...(opts?.fileSize != null && { fileSize: opts.fileSize }),
  }
}

export function createVideoItem(
  id: string,
  pos: Pos,
  src: string,
  width: number,
  height: number,
  opts?: { name?: string; fileSize?: number; originalWidth?: number; originalHeight?: number },
): VideoItem {
  // Scale down large videos to reasonable canvas size
  const maxDim = 640
  let w = width
  let h = height
  if (w > maxDim || h > maxDim) {
    const scale = maxDim / Math.max(w, h)
    w = Math.round(w * scale)
    h = Math.round(h * scale)
  }
  return {
    id,
    type: 'video',
    ...pos,
    src,
    width: w,
    height: h,
    originalWidth: opts?.originalWidth ?? width,
    originalHeight: opts?.originalHeight ?? height,
    muted: true,
    loop: false,
    ...(opts?.name != null && { name: opts.name }),
    ...(opts?.fileSize != null && { fileSize: opts.fileSize }),
  }
}

export function createPdfItem(
  id: string,
  pos: Pos,
  src: string,
  width: number,
  height: number,
  opts?: { name?: string; fileSize?: number; thumbnailSrc?: string },
): PdfItem {
  return {
    id,
    type: 'pdf',
    ...pos,
    src,
    width,
    height,
    ...(opts?.name != null && { name: opts.name }),
    ...(opts?.fileSize != null && { fileSize: opts.fileSize }),
    ...(opts?.thumbnailSrc != null && { thumbnailSrc: opts.thumbnailSrc }),
  }
}

export function createTextFileItem(
  id: string,
  pos: Pos,
  src: string,
  width: number,
  height: number,
  opts?: { name?: string; fileSize?: number; fileFormat?: TextFileFormat },
): TextFileItem {
  return {
    id,
    type: 'text-file',
    ...pos,
    src,
    width,
    height,
    fileFormat: opts?.fileFormat ?? 'txt',
    fontMono: true,
    ...(opts?.name != null && { name: opts.name }),
    ...(opts?.fileSize != null && { fileSize: opts.fileSize }),
  }
}
