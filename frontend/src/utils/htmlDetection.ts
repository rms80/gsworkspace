/**
 * Utility functions for detecting HTML content in text strings.
 * Separated into its own module for easy iteration and testing.
 */

/**
 * Strips markdown code fences from text if present.
 * Handles formats like:
 *   ```html
 *   <html>...</html>
 *   ```
 * or just:
 *   ```
 *   <html>...</html>
 *   ```
 *
 * @param text - The text string to process
 * @returns The text with code fences removed, or the original text if no fences found
 */
export function stripCodeFences(text: string): string {
  if (!text || typeof text !== 'string') {
    return text
  }

  const trimmed = text.trim()

  // Match opening fence (``` optionally followed by language identifier) and closing fence (```)
  // The 's' flag makes . match newlines
  const codeFencePattern = /^```(?:\w*)\n?([\s\S]*?)\n?```$/
  const match = trimmed.match(codeFencePattern)

  if (match) {
    return match[1].trim()
  }

  return text
}

/**
 * Detects whether a text string appears to be an HTML webpage.
 *
 * This function checks for common patterns that indicate the text is meant
 * to be rendered as HTML rather than displayed as plain text.
 *
 * @param text - The text string to analyze
 * @returns true if the text appears to be HTML content
 */
export function isHtmlContent(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false
  }

  // Strip code fences first, as LLMs often wrap HTML in ```html ... ```
  const trimmed = stripCodeFences(text).trim()

  // Check for DOCTYPE declaration (strong indicator)
  if (/^<!doctype\s+html/i.test(trimmed)) {
    return true
  }

  // Check for opening <html> tag at the start
  if (/^<html[\s>]/i.test(trimmed)) {
    return true
  }

  // Check for common HTML document structure patterns
  // Must have both opening and closing tags for key structural elements
  const hasHtmlTags = /<html[\s>]/i.test(trimmed) && /<\/html>/i.test(trimmed)
  const hasHeadTags = /<head[\s>]/i.test(trimmed) && /<\/head>/i.test(trimmed)
  const hasBodyTags = /<body[\s>]/i.test(trimmed) && /<\/body>/i.test(trimmed)

  // If it has full HTML document structure, it's HTML
  if (hasHtmlTags || (hasHeadTags && hasBodyTags)) {
    return true
  }

  // Check for HTML that starts with head or body directly
  if (/^<head[\s>]/i.test(trimmed) || /^<body[\s>]/i.test(trimmed)) {
    return true
  }

  // Check for substantial HTML content (multiple structural tags)
  // This catches cases where LLM outputs a webpage without the doctype
  const structuralTags = [
    /<style[\s>]/i,
    /<script[\s>]/i,
    /<link\s+/i,
    /<meta\s+/i,
  ]

  const structuralTagCount = structuralTags.filter(pattern => pattern.test(trimmed)).length

  // If we have style/script tags along with common container elements, likely HTML
  if (structuralTagCount >= 1) {
    const hasContainerElements = /<div[\s>]/i.test(trimmed) || /<section[\s>]/i.test(trimmed) ||
                                  /<main[\s>]/i.test(trimmed) || /<article[\s>]/i.test(trimmed)
    if (hasContainerElements) {
      return true
    }
  }

  return false
}
