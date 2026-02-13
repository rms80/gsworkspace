import { TextFileFormat } from '../types'

export interface CodeBlock {
  format: TextFileFormat | 'html'
  content: string
}

export interface CodeBlockExtraction {
  text: string           // remaining text with blocks removed
  codeBlocks: CodeBlock[]
}

/** Map fence language tags (including aliases) to our format types */
const LANGUAGE_MAP: Record<string, TextFileFormat | 'html'> = {
  csv: 'csv',
  js: 'js',
  javascript: 'js',
  ts: 'ts',
  typescript: 'ts',
  tsx: 'tsx',
  cs: 'cs',
  csharp: 'cs',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'c',
  h: 'h',
  json: 'json',
  py: 'py',
  python: 'py',
  md: 'md',
  markdown: 'md',
  sh: 'sh',
  bash: 'sh',
  shell: 'sh',
  ini: 'ini',
  log: 'log',
  txt: 'txt',
  text: 'txt',
  html: 'html',
}

/** All recognized language tags joined for regex alternation */
const LANG_TAGS = Object.keys(LANGUAGE_MAP)
  // Sort longest-first so "c++" matches before "c", "javascript" before "js", etc.
  .sort((a, b) => b.length - a.length)
  .map(tag => tag.replace(/\+/g, '\\+'))
  .join('|')

/** Regex matching a code fence with one of our known language tags */
const CODE_FENCE_RE = new RegExp(
  '```(' + LANG_TAGS + ')[ \\t]*\\r?\\n([\\s\\S]*?)\\r?\\n```',
  'gi'
)

/**
 * Extract all recognized code fence blocks from LLM output text.
 * Returns the remaining text (blocks removed, excess blank lines collapsed)
 * and an array of extracted CodeBlock objects.
 */
export function extractCodeBlocks(input: string): CodeBlockExtraction {
  const codeBlocks: CodeBlock[] = []

  // Reset lastIndex since we reuse the regex
  CODE_FENCE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = CODE_FENCE_RE.exec(input)) !== null) {
    const langTag = match[1].toLowerCase()
    const content = match[2].trim()
    const format = LANGUAGE_MAP[langTag]
    if (content && format) {
      codeBlocks.push({ format, content })
    }
  }

  if (codeBlocks.length === 0) {
    return { text: input, codeBlocks: [] }
  }

  // Remove the code blocks from the text
  CODE_FENCE_RE.lastIndex = 0
  const text = input
    .replace(CODE_FENCE_RE, '')
    // Collapse runs of 3+ newlines into 2
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { text, codeBlocks }
}
