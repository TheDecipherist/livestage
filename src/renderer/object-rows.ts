// Shared by every format module that now accepts an array of objects, not
// just an array of strings (feature: @render source=, class 3 composition
// work). One internal representation, one place that decides how a cell's
// value becomes displayable text, so table/list/numbered/links/bar/inline
// don't each reinvent this.

export function isObjectRows(data: readonly unknown[]): data is Record<string, unknown>[] {
  return data.length > 0 && data[0] !== null && typeof data[0] === 'object' && !Array.isArray(data[0])
}

export function cellText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// Column order for headers/rows: explicit columns= wins; otherwise every
// key on the first object, in insertion order (matches @list's listJson
// convention of "first row decides the shape" for a not-fully-uniform array).
export function objectHeaders(data: Record<string, unknown>[], columns?: string[]): string[] {
  if (columns && columns.length > 0) return columns
  return Object.keys(data[0] ?? {})
}

export function objectToRow(obj: Record<string, unknown>, headers: string[]): string[] {
  return headers.map(h => cellText(obj[h]))
}

// For single-value-per-item formats (list/numbered/links/bar/inline): with
// exactly one column named, use that field's value directly; with more than
// one, join as "key: value" pairs; with none given, do the same over every
// field on the object, so nothing is silently dropped just because the
// format only shows one line per item.
export function objectToLine(obj: Record<string, unknown>, columns?: string[]): string {
  const keys = columns && columns.length > 0 ? columns : Object.keys(obj)
  if (keys.length === 1) return cellText(obj[keys[0]!])
  return keys.map(k => `${k}: ${cellText(obj[k])}`).join(', ')
}

// Normalizes RendererInput.data down to plain strings for the formats that
// only ever operate on one line per item (list/numbered/links/bar/inline).
// A string[] input passes through untouched (the pre-existing contract);
// an object[] input becomes one line per object via objectToLine, after
// which every existing per-format string-parsing rule (bar's "label value"
// split, links' path-to-text derivation, etc.) applies exactly as before.
export function toLines(data: readonly unknown[], columns?: string[]): string[] {
  if (isObjectRows(data)) return data.map(o => objectToLine(o, columns))
  return data as string[]
}
