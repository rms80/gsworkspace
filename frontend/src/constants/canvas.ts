import { LLMModel, ImageGenModel } from '../types'

// --- Prompt header & button dimensions (shared across all prompt types) ---

export const PROMPT_HEADER_HEIGHT = 28
export const RUN_BUTTON_WIDTH = 40
export const MODEL_BUTTON_WIDTH = 20
export const BUTTON_HEIGHT = 20
export const BUTTON_GAP = 4

// --- Coding Robot dimensions ---

export const CODING_ROBOT_HEADER_HEIGHT = 28
export const CODING_ROBOT_INPUT_HEIGHT = 60
export const CODING_ROBOT_SEND_BUTTON_WIDTH = 50

// --- HTML item dimensions ---

export const HTML_HEADER_HEIGHT = 24
export const EXPORT_BUTTON_WIDTH = 50
export const ZOOM_BUTTON_WIDTH = 24

// --- Video item dimensions ---

export const VIDEO_HEADER_HEIGHT = 24

// --- PDF item dimensions ---

export const PDF_HEADER_HEIGHT = 24
export const PDF_MINIMIZED_WIDTH = 120
export const PDF_MINIMIZED_HEIGHT = 160

// --- Text file item dimensions ---

export const TEXTFILE_HEADER_HEIGHT = 24
export const TEXTFILE_MINIMIZED_WIDTH = 120
export const TEXTFILE_MINIMIZED_HEIGHT = 160

// Supported text file extensions
export const TEXT_FILE_EXTENSIONS = ['txt', 'csv', 'js', 'ts', 'tsx', 'cs', 'cpp', 'h', 'c', 'json', 'py', 'md', 'sh', 'log', 'ini'] as const
export const TEXT_FILE_EXTENSION_PATTERN = /\.(txt|csv|js|tsx?|cs|cpp|h|c|json|py|md|sh|log|ini)$/i

/** Extract text file format from a filename, or null if not a supported text file */
export function getTextFileFormat(filename: string): string | null {
  const match = filename.match(TEXT_FILE_EXTENSION_PATTERN)
  return match ? match[1].toLowerCase() : null
}

// --- Image item dimensions ---

export const IMAGE_HEADER_HEIGHT = 24

// --- Item constraints ---

export const MIN_PROMPT_WIDTH = 100
export const MIN_PROMPT_HEIGHT = 60
export const MIN_TEXT_WIDTH = 50

// --- Zoom ---

export const ZOOM_STEP = 0.25
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 3

// --- Z-index ---

export const Z_IFRAME_OVERLAY = 10
export const Z_MENU = 1000

// --- Selection colors ---

export const COLOR_SELECTED = '#0066cc'
export const COLOR_BORDER_DEFAULT = '#ccc'

// --- Prompt type theme colors ---

export interface PromptThemeColors {
  border: string
  headerBg: string
  itemBg: string
  headerText: string
  contentText: string
  runButton: string
  // Pulse: border pulses between [r,g,b] and [r+dr, g+dg, b+db]
  pulseBorder: { base: [number, number, number]; delta: [number, number, number] }
  // Pulse: run button color range
  pulseRunButton: { base: [number, number, number]; delta: [number, number, number] }
  // Editing overlay colors
  inputBorder: string
  inputBg: string
  inputText: string
  textareaBg: string
}

export const PROMPT_THEME: PromptThemeColors = {
  border: '#c9a227',
  headerBg: '#e8d89c',
  itemBg: '#f8f4e8',
  headerText: '#5c4d1a',
  contentText: '#333',
  runButton: '#4a7c59',
  pulseBorder: { base: [210, 105, 30], delta: [45, 95, 70] },
  pulseRunButton: { base: [200, 90, 20], delta: [55, 90, 60] },
  inputBorder: '#c9a227',
  inputBg: '#e8d89c',
  inputText: '#5c4d1a',
  textareaBg: '#f8f4e8',
}

export const IMAGE_GEN_PROMPT_THEME: PromptThemeColors = {
  border: '#8b5cf6',
  headerBg: '#ddd6fe',
  itemBg: '#f5f3ff',
  headerText: '#5b21b6',
  contentText: '#333',
  runButton: '#7c3aed',
  pulseBorder: { base: [138, 43, 226], delta: [62, 107, 29] },
  pulseRunButton: { base: [138, 43, 200], delta: [62, 107, 55] },
  inputBorder: '#8b5cf6',
  inputBg: '#ddd6fe',
  inputText: '#5b21b6',
  textareaBg: '#f5f3ff',
}

export const HTML_GEN_PROMPT_THEME: PromptThemeColors = {
  border: '#0d9488',
  headerBg: '#99f6e4',
  itemBg: '#ccfbf1',
  headerText: '#134e4a',
  contentText: '#333',
  runButton: '#0f766e',
  pulseBorder: { base: [13, 148, 136], delta: [81, 86, 76] },
  pulseRunButton: { base: [13, 148, 136], delta: [81, 86, 76] },
  inputBorder: '#0d9488',
  inputBg: '#99f6e4',
  inputText: '#134e4a',
  textareaBg: '#ccfbf1',
}

export const CODING_ROBOT_THEME: PromptThemeColors = {
  border: '#8a8a8a',
  headerBg: '#b0b0b0',
  itemBg: '#f0f0f0',
  headerText: '#2a2a2a',
  contentText: '#333',
  runButton: '#22c55e',
  pulseBorder: { base: [138, 138, 138], delta: [60, 60, 60] },
  pulseRunButton: { base: [100, 100, 100], delta: [60, 60, 60] },
  inputBorder: '#8a8a8a',
  inputBg: '#b0b0b0',
  inputText: '#2a2a2a',
  textareaBg: '#f0f0f0',
}

// --- Pulse color helper ---

export function getPulseColor(
  pulseIntensity: number,
  range: { base: [number, number, number]; delta: [number, number, number] },
): string {
  const [r, g, b] = range.base
  const [dr, dg, db] = range.delta
  return `rgb(${Math.round(r + dr * pulseIntensity)}, ${Math.round(g + dg * pulseIntensity)}, ${Math.round(b + db * pulseIntensity)})`
}

// --- Model lists ---

export const LLM_MODELS: LLMModel[] = ['claude-haiku', 'claude-sonnet', 'claude-opus', 'gemini-flash', 'gemini-pro']

export const IMAGE_GEN_MODELS: ImageGenModel[] = ['gemini-imagen', 'gemini-flash-imagen']

export const LLM_MODEL_LABELS: Record<LLMModel, string> = {
  'claude-haiku': 'Claude Haiku',
  'claude-sonnet': 'Claude Sonnet',
  'claude-opus': 'Claude Opus',
  'gemini-flash': 'Gemini 3 Flash',
  'gemini-pro': 'Gemini 3 Pro',
}

export const IMAGE_GEN_MODEL_LABELS: Record<ImageGenModel, string> = {
  'gemini-imagen': 'Gemini Nanobana',
  'gemini-flash-imagen': 'Gemini Nanobana Pro',
}
