import type { EngineContext } from './context.js'

// Part 2, rule 3: dotted access on a string result (parse="text", or any
// other plain-string ctx.data binding) is an error, not a silent empty
// render. `{{ label.field }}` where `label` resolves to a JS string
// returns `undefined` from plain property access with no exception at
// all (strings have no such field), so this can't rely on a natural
// runtime error the way the existing ReferenceError-suppression path
// does; it has to check ahead of evaluation. Scoped to the FIRST dotted
// segment of the expression: `label.field` is checked, `label` alone
// (no dot) or `other.label.field` (a different base) are not this case.
const LEADING_DOTTED_RE = /^([A-Za-z_$][A-Za-z0-9_$]*)\.[A-Za-z_$]/

export function checkDottedAccessOnString(expr: string, ctx: EngineContext): void {
  const m = LEADING_DOTTED_RE.exec(expr.trim())
  if (!m) return
  const base = m[1]!
  const value = ctx.data?.[base]
  if (typeof value === 'string') {
    throw new Error(
      `Cannot resolve "${expr.trim()}": "${base}" is a plain string, not structured data (bound via parse="text", or a scalar {{ }} @set). ` +
      `Use a structured parse= format (json, csv, ndjson, tsv, xml, yaml) if "${base}" should have fields.`
    )
  }
}
