/**
 * Extract CSV code fence blocks from LLM output text.
 */
export interface CsvExtraction {
  text: string        // remaining text with CSV blocks removed
  csvBlocks: string[] // extracted CSV data strings
}

/**
 * Finds all ```csv ... ``` code fence blocks in the input,
 * extracts their content, and returns the remaining text with
 * excess blank lines collapsed.
 */
export function extractCsvBlocks(input: string): CsvExtraction {
  const csvBlocks: string[] = []
  // Match ```csv (with optional trailing whitespace) followed by content, then closing ```
  const regex = /```csv[ \t]*\r?\n([\s\S]*?)\r?\n```/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(input)) !== null) {
    const csvContent = match[1].trim()
    if (csvContent) {
      csvBlocks.push(csvContent)
    }
  }

  if (csvBlocks.length === 0) {
    return { text: input, csvBlocks: [] }
  }

  // Remove the CSV blocks from the text
  const text = input
    .replace(regex, '')
    // Collapse runs of 3+ newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { text, csvBlocks }
}
