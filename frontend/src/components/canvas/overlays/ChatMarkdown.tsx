import { Fragment, ReactNode } from 'react'

/**
 * A little markdown for chat replies: ```fenced code blocks```, # headings, | tables |,
 * `inline code`, **bold** and *italic*. Renders React elements (never HTML), so agent output can't
 * inject markup. Everything else stays plain text; the container keeps whitespace (pre-wrap).
 */

const MONO = '"Cascadia Code", "Fira Code", "Consolas", monospace'

// Fences start and end at the start of a line; an unclosed one runs to the end of the text
const FENCE_RE = /(?:^|\n)```[^\n]*\n([\s\S]*?)(?:\n```|(?![\s\S]))/g
// Emphasis must hug its text (so "2 * 3 * 4" stays as is)
const INLINE_RE = /`([^`\n]+)`|\*\*(?=\S)([^\n]*?\S)\*\*|\*(?=[^\s*])([^*\n]*?[^\s*])\*/g
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/
// | --- | :--: | ---: |
const TABLE_SEPARATOR_RE = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/

const HEADING_SIZES = ['1.3em', '1.18em', '1.08em', '1em', '1em', '1em']

type Align = 'left' | 'center' | 'right'

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  let i = 0
  for (const match of text.matchAll(INLINE_RE)) {
    const start = match.index ?? 0
    if (start > last) nodes.push(text.slice(last, start))
    const key = `${keyPrefix}-${i++}`
    const [, code, bold, italic] = match
    if (code !== undefined) {
      nodes.push(
        <code key={key} style={{ fontFamily: MONO, fontSize: '0.92em', background: 'rgba(0, 0, 0, 0.08)', borderRadius: '0.25em', padding: '0 0.25em' }}>
          {code}
        </code>
      )
    } else if (bold !== undefined) {
      nodes.push(<strong key={key}>{renderInline(bold, key)}</strong>)
    } else {
      nodes.push(<em key={key}>{renderInline(italic, key)}</em>)
    }
    last = start + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** The cells of a | a | b | row; \| is a literal pipe */
function tableCells(row: string): string[] {
  const inner = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

function alignment(separatorCell: string): Align {
  const left = separatorCell.startsWith(':')
  const right = separatorCell.endsWith(':')
  return left && right ? 'center' : right ? 'right' : 'left'
}

function renderTable(lines: string[], key: string): ReactNode {
  const header = tableCells(lines[0])
  const aligns = tableCells(lines[1]).map(alignment)
  const rows = lines.slice(2).map(tableCells)
  const cellStyle = (col: number): React.CSSProperties => ({
    border: '1px solid rgba(0, 0, 0, 0.18)',
    padding: '0.15em 0.5em',
    textAlign: aligns[col] ?? 'left',
    verticalAlign: 'top',
  })
  return (
    <div key={key} style={{ overflowX: 'auto', margin: '0.3em 0', whiteSpace: 'normal' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: '0.95em' }}>
        <thead>
          <tr style={{ background: 'rgba(0, 0, 0, 0.06)' }}>
            {header.map((cell, c) => (
              <th key={c} style={{ ...cellStyle(c), fontWeight: 600 }}>{renderInline(cell, `${key}-h${c}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {header.map((_, c) => (
                <td key={c} style={cellStyle(c)}>{renderInline(row[c] ?? '', `${key}-${r}-${c}`)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Text outside code blocks: headings and tables are blocks, the rest is inline-formatted text */
function renderText(segment: string, key: string): ReactNode[] {
  const lines = segment.split('\n')
  const nodes: ReactNode[] = []
  let textLines: string[] = []
  let n = 0

  const flushText = () => {
    // Blank lines next to a block are the block's own spacing
    while (textLines.length && !textLines[0].trim()) textLines.shift()
    while (textLines.length && !textLines[textLines.length - 1].trim()) textLines.pop()
    if (textLines.length) {
      const k = `${key}-${n++}`
      nodes.push(<Fragment key={k}>{renderInline(textLines.join('\n'), k)}</Fragment>)
    }
    textLines = []
  }

  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(HEADING_RE)
    if (heading) {
      flushText()
      const level = heading[1].length
      const k = `${key}-${n++}`
      nodes.push(
        <div key={k} style={{ fontSize: HEADING_SIZES[level - 1], fontWeight: 700, margin: '0.35em 0 0.15em', whiteSpace: 'normal' }}>
          {renderInline(heading[2], k)}
        </div>
      )
      continue
    }
    if (TABLE_ROW_RE.test(lines[i]) && i + 1 < lines.length && TABLE_SEPARATOR_RE.test(lines[i + 1])) {
      flushText()
      let end = i + 2
      while (end < lines.length && TABLE_ROW_RE.test(lines[end])) end++
      nodes.push(renderTable(lines.slice(i, end), `${key}-${n++}`))
      i = end - 1
      continue
    }
    textLines.push(lines[i])
  }
  flushText()
  return nodes
}

export default function ChatMarkdown({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let last = 0
  let i = 0
  const pushText = (segment: string) => {
    parts.push(...renderText(segment, `t${i++}`))
  }
  for (const match of text.matchAll(FENCE_RE)) {
    const start = match.index ?? 0
    pushText(text.slice(last, start))
    parts.push(
      <pre
        key={`c${i++}`}
        style={{
          fontFamily: MONO,
          fontSize: '0.88em',
          background: 'rgba(0, 0, 0, 0.07)',
          borderRadius: '0.35em',
          padding: '0.4em 0.6em',
          margin: '0.3em 0',
          whiteSpace: 'pre',
          overflowX: 'auto',
        }}
      >
        {match[1]}
      </pre>
    )
    last = start + match[0].length
  }
  pushText(text.slice(last))
  return <>{parts}</>
}
