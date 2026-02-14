/**
 * Simple CSV parser that handles quoted fields, commas inside quotes,
 * newlines inside quotes, and escaped double-quotes ("").
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          // Escaped double-quote
          field += '"'
          i += 2
        } else {
          // End of quoted field
          inQuotes = false
          i++
        }
      } else {
        field += ch
        i++
      }
    } else {
      if (ch === '"') {
        inQuotes = true
        i++
      } else if (ch === ',') {
        row.push(field)
        field = ''
        i++
      } else if (ch === '\r') {
        // Handle \r\n or lone \r
        row.push(field)
        field = ''
        rows.push(row)
        row = []
        i++
        if (i < text.length && text[i] === '\n') {
          i++
        }
      } else if (ch === '\n') {
        row.push(field)
        field = ''
        rows.push(row)
        row = []
        i++
      } else {
        field += ch
        i++
      }
    }
  }

  // Push last field/row if there's content
  if (field || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // Remove trailing empty row (from trailing newline)
  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1]
    if (lastRow.length === 1 && lastRow[0] === '') {
      rows.pop()
    }
  }

  return rows
}
