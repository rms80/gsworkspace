/**
 * Resolves an asset path to a full URL.
 *
 * - If the path is a data URL (data:), blob URL (blob:), or absolute URL (http://, https://),
 *   it's returned as-is (these are new assets not yet saved to storage).
 * - If the path is relative (just a filename), it's combined with the baseUrl.
 *
 * @param baseUrl The base URL for the scene's asset folder (e.g., "https://bucket.s3.region.amazonaws.com/folder/scene-id/")
 * @param path The asset path (either relative filename or absolute URL)
 * @returns The resolved full URL
 */
export function resolveAssetUrl(baseUrl: string | undefined, path: string): string {
  // Already an absolute URL or special protocol - return as-is
  if (
    path.startsWith('data:') ||
    path.startsWith('blob:') ||
    path.startsWith('http://') ||
    path.startsWith('https://')
  ) {
    return path
  }

  // Relative path - combine with base URL
  if (baseUrl) {
    return baseUrl + path
  }

  // No base URL available - return path as-is (shouldn't happen in normal operation)
  return path
}

/**
 * Checks if an asset path is a relative path (i.e., just a filename, not a full URL).
 * Relative paths indicate assets that are already saved to storage.
 *
 * @param path The asset path to check
 * @returns True if the path is relative (saved asset), false if it's an absolute URL (new asset)
 */
export function isRelativeAssetPath(path: string): boolean {
  return !(
    path.startsWith('data:') ||
    path.startsWith('blob:') ||
    path.startsWith('http://') ||
    path.startsWith('https://')
  )
}
