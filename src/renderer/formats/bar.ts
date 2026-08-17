import type { FormatModule, RendererInput } from '../types.js'
import { isObjectRows, cellText } from '../object-rows.js'

const BAR_WIDTH = 20

interface BarRow { label: string; value: number }

function parseBarRow(line: string): BarRow {
  const parts = line.trim().split(/\s+/)
  const last = parts.at(-1) ?? ''
  const value = parseFloat(last)
  const label = isNaN(value)
    ? line
    : parts.slice(0, -1).join(' ')
  return { label, value: isNaN(value) ? 0 : value }
}

// Object rows need a label/value SHAPE, not a generic "key: value" line
// (objectToLine's default), since the bar needs an actual number to size
// itself against. columns="name,count" names them explicitly; with no
// columns=, the first field is the label and the first NUMERIC field is
// the value (a plain string field never parses as a bar length).
function objectBarRow(obj: Record<string, unknown>, columns?: string[]): BarRow {
  if (columns && columns.length >= 2) {
    return { label: cellText(obj[columns[0]!]), value: Number(obj[columns[1]!]) || 0 }
  }
  const entries = Object.entries(obj)
  const labelEntry = entries[0]
  const valueEntry = entries.find(([, v]) => typeof v === 'number') ?? entries[1]
  return {
    label: labelEntry ? cellText(labelEntry[1]) : '',
    value: valueEntry ? Number(valueEntry[1]) || 0 : 0,
  }
}

const bar: FormatModule = {
  name: 'bar',
  render(input: RendererInput): string {
    const rows = isObjectRows(input.data)
      ? input.data.map(o => objectBarRow(o, input.columns))
      : input.data.map(parseBarRow)
    const maxValue = rows.reduce((m, r) => Math.max(m, r.value), 1)
    const maxLabel = rows.reduce((m, r) => Math.max(m, r.label.length), 0)

    return rows.map(({ label, value }) => {
      const bars = Math.max(1, Math.round((value / maxValue) * BAR_WIDTH))
      const barStr = '█'.repeat(bars)
      return `${label.padEnd(maxLabel)}  ${barStr} ${value}`
    }).join('\n')
  },
}

export default bar
