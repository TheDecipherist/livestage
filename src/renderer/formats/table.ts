import type { FormatModule, RendererInput } from '../types.js'
import { isObjectRows, objectHeaders, objectToRow } from '../object-rows.js'

function parseRow(line: string): string[] {
  return line.split('\t').map(c => c.trim())
}

const table: FormatModule = {
  name: 'table',
  render(input: RendererInput): string {
    const { data, columns, options } = input

    let headers: string[]
    let rows: string[][]
    if (isObjectRows(data)) {
      // Object rows derive their headers from the first object's own keys
      // when columns= isn't given, no "first line is the header" special
      // case needed, the shape is already known.
      headers = objectHeaders(data, columns)
      rows = data.map(o => objectToRow(o, headers))
    } else {
      const hasExplicitColumns = columns !== undefined && columns.length > 0
      headers = hasExplicitColumns ? columns! : (data[0] ? parseRow(data[0]) : [])
      rows = hasExplicitColumns ? data.map(parseRow) : data.slice(1).map(parseRow)
    }

    const colCount = headers.length
    // Security (feature 20 B1, 2026-08-17): column-max-width padding is
    // valid GFM alignment that any markdown viewer collapses visually, but
    // pure noise when the rendered output is read as raw text rather than
    // through a viewer (CLAUDE.md, consumed directly by Claude Code, is
    // exactly this case). A single wide outlier cell pads every other row
    // in its column to match, hundreds of trailing spaces per line.
    // compact="true" opts out per-render; the default (padded, aligned)
    // is unchanged for every existing call site.
    const compact = options?.['compact'] === 'true'
    const widths = compact
      ? []
      : headers.map((h, i) =>
        Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
      )

    const pad = (s: string, w: number) => compact ? s : s.padEnd(w)
    const header = '| ' + headers.map((h, i) => pad(h, widths[i] ?? h.length)).join(' | ') + ' |'
    const sep = '|' + (compact ? headers.map(() => '---').join('|') : widths.map(w => '-'.repeat(w + 2)).join('|')) + '|'
    const body = rows.map(row =>
      '| ' + Array.from({ length: colCount }, (_, i) =>
        pad(row[i] ?? '', widths[i] ?? 0)
      ).join(' | ') + ' |'
    )

    return [header, sep, ...body].join('\n')
  },
}

export default table
