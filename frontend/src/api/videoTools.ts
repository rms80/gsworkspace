import { ACTIVE_WORKSPACE } from './workspace'
import { validateUuid } from '../utils/validation'

const API_BASE = `/api/w/${ACTIVE_WORKSPACE}/video-tools`

export interface VideoEdits {
  cropRect?: { x: number; y: number; width: number; height: number }
  speed?: number
  removeAudio?: boolean
  trim?: { start: number; end: number }
}

export type ClipTransition = 'cut' | 'crossfade' | 'dip'

export interface ConcatClip {
  videoId: string
  /** Use the rendered edited version (<id>.crop.mp4) instead of the original */
  useEdited: boolean
  /** Changes whenever the clip's file changes, so the server can cache downloaded clips */
  version: string
}

async function post<T>(endpoint: string, body: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => null)
    throw new Error(detail?.error ?? `${endpoint} failed: ${response.statusText}`)
  }
  return response.json()
}

/** Copy a video's files to a new item id: the original, plus the rendered edited version if copyEdited */
export function duplicateVideoFiles(sceneId: string, videoId: string, newVideoId: string, copyEdited: boolean) {
  validateUuid(sceneId, 'scene ID')
  validateUuid(videoId, 'video ID')
  validateUuid(newVideoId, 'new video ID')
  return post<{ url: string; fileSize: number; cropUrl?: string; cropFileSize?: number }>(
    'duplicate', { sceneId, videoId, newVideoId, copyEdited }
  )
}

/** Render a video's edits into the original file of a new item id */
export function bakeVideoEdits(sceneId: string, videoId: string, newVideoId: string, edits: VideoEdits) {
  validateUuid(sceneId, 'scene ID')
  validateUuid(videoId, 'video ID')
  validateUuid(newVideoId, 'new video ID')
  return post<{ url: string; width: number; height: number; fileSize: number }>(
    'bake-edits', { sceneId, videoId, newVideoId, edits }
  )
}

/** Resize a video to an exact (even) resolution, saved as the original file of a new item id */
export function resizeVideo(sceneId: string, videoId: string, newVideoId: string, width: number, height: number, nearest: boolean) {
  validateUuid(sceneId, 'scene ID')
  validateUuid(videoId, 'video ID')
  validateUuid(newVideoId, 'new video ID')
  return post<{ url: string; fileSize: number }>('resize', { sceneId, videoId, newVideoId, width, height, nearest })
}

interface ConcatParams {
  sceneId: string
  clips: ConcatClip[]
  /** Transition between each pair of consecutive clips */
  transitions: ClipTransition[]
  /** Length of cross-fade / dip-to-black transitions, in seconds */
  transitionDuration: number
  /** Output size: the largest clip width × height, or the first clip's size */
  resolution: OutputResolution
}

export type OutputResolution = 'largest' | 'first'

/** Render a fast, reduced-resolution temporary preview of clips appended with transitions */
export function createVideoPreview(params: ConcatParams, signal?: AbortSignal) {
  validateUuid(params.sceneId, 'scene ID')
  return post<{ url: string; previewId: string; width: number; height: number; duration: number; clipDurations: number[] }>(
    'concat', { ...params, preview: true }, signal
  )
}

/** Render clips appended with transitions at full quality, saved as the original file of a new item */
export function createVideo(params: ConcatParams & { newVideoId: string }) {
  validateUuid(params.sceneId, 'scene ID')
  validateUuid(params.newVideoId, 'new video ID')
  return post<{ url: string; width: number; height: number; duration: number; fileSize: number }>('concat', params)
}

/** Delete a temporary Create Video preview */
export async function discardVideoPreview(previewId: string): Promise<void> {
  await post('discard-preview', { previewId }).catch(() => {})
}
