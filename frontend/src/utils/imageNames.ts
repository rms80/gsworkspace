/**
 * Generate a unique image name given a base name and list of existing names.
 *
 * For filenames: strips extension, checks if name exists, appends "2", "3", etc.
 * For pasted images: use base "Image", generates "Image1", "Image2", etc.
 *
 * Examples:
 *   generateUniqueImageName("photo.png", []) → "photo"
 *   generateUniqueImageName("photo.png", ["photo"]) → "photo2"
 *   generateUniqueImageName("Image", ["Image1", "Image2"]) → "Image3"
 */
export function generateUniqueImageName(baseName: string, existingNames: string[]): string {
  // Strip file extension if present
  const nameWithoutExt = baseName.replace(/\.[^/.]+$/, '')

  // Check if this is an "Image" base name (for pasted images)
  const isImageBase = nameWithoutExt === 'Image'

  if (isImageBase) {
    // For "Image" base, always use numbered format: Image1, Image2, etc.
    let counter = 1
    while (existingNames.includes(`Image${counter}`)) {
      counter++
    }
    return `Image${counter}`
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
 * Get all existing image names from a list of canvas items.
 */
export function getExistingImageNames(items: Array<{ type: string; name?: string }>): string[] {
  return items
    .filter((item) => item.type === 'image' && item.name)
    .map((item) => item.name as string)
}
