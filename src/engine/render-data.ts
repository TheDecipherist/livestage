// Shared presentation helpers for @render (source=) and @foreach: sort=,
// limit=, where=. One place so both directives apply the same semantics
// rather than each growing its own slightly-different filter/sort logic.

import { whereMatches } from './sources-file-utils.js'

// A row's value for sort=/where= purposes: the named field on an object
// row, or the scalar itself when the row isn't an object (a plain string/
// number array has no fields to reference, so the field name is ignored
// and the row's own value is used, direction still applies).
function fieldValue(row: unknown, field: string): unknown {
  if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
    return (row as Record<string, unknown>)[field]
  }
  return row
}

// sort="file" ascending, sort="-count" descending. Stable (Array.prototype
// .sort is guaranteed stable since ES2019): equal keys keep their original
// relative order rather than shuffling.
export function applySort<T>(rows: T[], sortSpec: string | undefined): T[] {
  if (!sortSpec) return rows
  const desc = sortSpec.startsWith('-')
  const field = desc ? sortSpec.slice(1) : sortSpec
  const copy = [...rows]
  copy.sort((a, b) => {
    const av = fieldValue(a, field)
    const bv = fieldValue(b, field)
    const an = typeof av === 'number' ? av : String(av ?? '')
    const bn = typeof bv === 'number' ? bv : String(bv ?? '')
    let cmp = 0
    if (an < bn) cmp = -1
    else if (an > bn) cmp = 1
    return desc ? -cmp : cmp
  })
  return copy
}

// limit="20": truncate to the first N rows. Pairs with the row count
// staying available to the document as `label.items.length` (no new
// binding needed, an ordinary array already has .length in the {{ }}
// sandbox) so "and N more" is one interpolation away, not a separate
// engine feature.
export function applyLimit<T>(rows: T[], limitSpec: string | undefined): T[] {
  if (!limitSpec) return rows
  const n = parseInt(limitSpec, 10)
  if (isNaN(n) || n < 0) return rows
  return rows.slice(0, n)
}

// where="kind == 'type'": reuses whereMatches (the same sandboxed
// expression evaluator @list's frontmatter where= already uses), given a
// plain object row directly, or { value: row } for a scalar row so
// where="value > 3" still works against a bare number/string array.
export function applyWhere<T>(rows: T[], whereExpr: string | undefined): T[] {
  if (!whereExpr) return rows
  return rows.filter(row => {
    const asRow = (row !== null && typeof row === 'object' && !Array.isArray(row))
      ? row as Record<string, unknown>
      : { value: row }
    return whereMatches(asRow, whereExpr)
  })
}
