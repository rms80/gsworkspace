import { ACTIVE_WORKSPACE } from './workspace'

export async function fetchYouTubeTitle(videoId: string): Promise<string> {
  try {
    const res = await fetch(`/api/w/${ACTIVE_WORKSPACE}/embed/youtube-title?videoId=${encodeURIComponent(videoId)}`)
    if (!res.ok) return 'YouTube Video'
    const data = await res.json()
    return data.title || 'YouTube Video'
  } catch {
    return 'YouTube Video'
  }
}
