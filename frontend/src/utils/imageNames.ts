/**
 * Generate a unique name given a base name and list of existing names.
 * Works for images, videos, and other named items.
 *
 * For filenames: strips extension, checks if name exists, appends "2", "3", etc.
 * For generic bases: "Image" → "Image1", "Image2", etc.
 *                   "Video" → "Video1", "Video2", etc.
 *
 * Examples:
 *   generateUniqueName("photo.png", []) → "photo"
 *   generateUniqueName("photo.png", ["photo"]) → "photo2"
 *   generateUniqueName("Image", ["Image1", "Image2"]) → "Image3"
 *   generateUniqueName("Video", ["Video1"]) → "Video2"
 */
export function generateUniqueName(baseName: string, existingNames: string[]): string {
  // Strip file extension if present
  const nameWithoutExt = baseName.replace(/\.[^/.]+$/, '')

  // Check if this is a generic base name (for pasted content)
  const isGenericBase = nameWithoutExt === 'Image' || nameWithoutExt === 'Video' || nameWithoutExt === 'PDF'

  if (isGenericBase) {
    // For generic bases, always use numbered format: Image1, Image2, Video1, Video2, etc.
    let counter = 1
    while (existingNames.includes(`${nameWithoutExt}${counter}`)) {
      counter++
    }
    return `${nameWithoutExt}${counter}`
  }

  // For regular filenames, first try without a number
  if (!existingNames.includes(nameWithoutExt)) {
    return nameWithoutExt
  }

  // If the base name exists, append numbers: name2, name3, etc.
  let counter = 2
  while (existingNames.includes(`${nameWithoutExt}${counter}`)) {
    counter++
  }
  return `${nameWithoutExt}${counter}`
}

/**
 * @deprecated Use generateUniqueName instead
 */
export function generateUniqueImageName(baseName: string, existingNames: string[]): string {
  return generateUniqueName(baseName, existingNames)
}

/**
 * Get all existing image names from a list of canvas items.
 */
export function getExistingImageNames(items: Array<{ type: string; name?: string }>): string[] {
  return items
    .filter((item) => item.type === 'image' && item.name)
    .map((item) => item.name as string)
}

/**
 * Get all existing video names from a list of canvas items.
 */
export function getExistingVideoNames(items: Array<{ type: string; name?: string }>): string[] {
  return items
    .filter((item) => item.type === 'video' && item.name)
    .map((item) => item.name as string)
}

/**
 * Get all existing PDF names from a list of canvas items.
 */
export function getExistingPdfNames(items: Array<{ type: string; name?: string }>): string[] {
  return items
    .filter((item) => item.type === 'pdf' && item.name)
    .map((item) => item.name as string)
}
