/**
 * Check if an image source is a GIF by data URL MIME type or URL extension.
 */
export function isGifSrc(src: string): boolean {
  if (src.startsWith('data:image/gif')) return true
  try {
    const pathname = new URL(src, 'http://dummy').pathname
    return pathname.toLowerCase().endsWith('.gif')
  } catch {
    return src.toLowerCase().endsWith('.gif')
  }
}
