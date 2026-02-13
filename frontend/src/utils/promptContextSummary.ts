import { CanvasItem } from '../types'

const TYPE_LABELS: Record<string, string> = {
  'text': 'text',
  'image': 'image',
  'video': 'video',
  'prompt': 'prompt',
  'image-gen-prompt': 'prompt',
  'html-gen-prompt': 'prompt',
  'html': 'html',
  'pdf': 'pdf',
  'text-file': 'text file',
}

export function getPromptContextSummary(
  items: CanvasItem[],
  selectedIds: string[],
  promptId: string
): string[] {
  const selectedSet = new Set(selectedIds)
  selectedSet.delete(promptId)

  const counts: Record<string, number> = {}
  for (const item of items) {
    if (!selectedSet.has(item.id)) continue
    const label = TYPE_LABELS[item.type] ?? item.type
    counts[label] = (counts[label] ?? 0) + 1
  }

  const lines = Object.entries(counts).map(([label, count]) => `${count} ${label}`)
  return lines.length > 0 ? lines : ['No context selected']
}
