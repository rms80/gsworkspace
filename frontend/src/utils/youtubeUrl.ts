/**
 * Extract a YouTube video ID from various URL formats.
 * Returns null if the text is not a recognized YouTube URL.
 */
export function extractYouTubeVideoId(text: string): string | null {
  const trimmed = text.trim()
  // Match youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID, youtube.com/shorts/ID
  const patterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = trimmed.match(pattern)
    if (match) return match[1]
  }
  return null
}

/**
 * Extract a start time (in seconds) from a YouTube URL.
 * Handles &t=10s, &t=10, ?t=120, &t=1h2m3s, &t=2m30s, etc.
 * Returns undefined if no start time is found.
 */
export function extractYouTubeStartTime(text: string): number | undefined {
  const trimmed = text.trim()
  // Match t= parameter with optional h/m/s components
  const match = trimmed.match(/[?&]t=(\d+[hms]?\d*[ms]?\d*s?)\b/)
  if (!match) return undefined
  const raw = match[1]
  // Pure number (seconds)
  if (/^\d+$/.test(raw)) return parseInt(raw, 10)
  // Parse h/m/s components
  let total = 0
  const hours = raw.match(/(\d+)h/)
  const minutes = raw.match(/(\d+)m/)
  const seconds = raw.match(/(\d+)s/)
  if (hours) total += parseInt(hours[1], 10) * 3600
  if (minutes) total += parseInt(minutes[1], 10) * 60
  if (seconds) total += parseInt(seconds[1], 10)
  return total > 0 ? total : undefined
}

export function getYouTubeEmbedUrl(videoId: string, startTime?: number): string {
  const params = startTime ? `?start=${startTime}` : ''
  return `https://www.youtube.com/embed/${videoId}${params}`
}
