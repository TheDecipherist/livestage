// Shared YAML frontmatter helpers used by @update-frontmatter (write) and
// @read-frontmatter (read).
//
// Supported subset: leading `---\n` ... `\n---\n` block at the very top of a
// markdown file, top-level scalar or list fields. List values are returned as
// their raw YAML representation so callers can interpolate them as-is. Nested
// objects and multi-line scalars are out of scope.

export const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/

export interface FrontmatterParse {
  fullBlock: string  // includes the `---` delimiters and trailing newline
  body: string       // content between the delimiters (no surrounding ---)
}

export function extractFrontmatter(content: string): FrontmatterParse | null {
  const m = content.match(FRONTMATTER_RE)
  if (!m) return null
  return { fullBlock: m[0] ?? '', body: m[1] ?? '' }
}

function escapeRegex(s: string): string {
  return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
}

export function fieldRegex(field: string): RegExp {
  return new RegExp(`^(${escapeRegex(field)}):[ \\t]*(.*)$`, 'm')
}

/**
 * Read a single top-level frontmatter field's value. Returns null if the file
 * has no frontmatter block. Returns empty string if the field is absent.
 *
 * For scalar values returns the trimmed value (no surrounding quotes stripped).
 * For YAML list fields (inline `field: [a, b]` or block `field:\n  - a\n  - b`)
 * returns the raw text including the surrounding brackets / hyphens — callers
 * can interpolate it directly.
 */
export function readFrontmatterField(content: string, field: string): string | null {
  const fm = extractFrontmatter(content)
  if (!fm) return null
  const re = fieldRegex(field)
  const m = fm.body.match(re)
  if (!m) return ''
  const scalar = (m[2] ?? '').trim()
  // Inline list: `field: [a, b, c]` — scalar already captures it.
  if (scalar !== '') return scalar
  // Block list: `field:\n  - a\n  - b`. Capture every subsequent indented line
  // starting with `-` until indentation drops or the block ends.
  const lines = fm.body.split('\n')
  const fieldLineIdx = lines.findIndex(l => re.test(l))
  if (fieldLineIdx === -1) return ''
  const items: string[] = []
  for (let i = fieldLineIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^\s+-\s/.test(line)) {
      items.push(line.trim().replace(/^-\s*/, ''))
      continue
    }
    if (line === '' || /^\s/.test(line)) continue
    break
  }
  return items.length > 0 ? items.join(', ') : ''
}

function unquoteScalar(v: string): string {
  if (v.length >= 2) {
    if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1)
    if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1)
  }
  return v
}

/**
 * Parse every top-level frontmatter field into a flat row, scalars as
 * (unquoted) strings and list fields (inline `[a, b]` or block `- a`/`- b`)
 * as real string arrays, so a `where=` expression can use `.length`/array
 * comparisons against them (feature 36, F-FM-QUERY). Same subset as
 * readFrontmatterField: top-level only, no nested objects. Returns null when
 * the file has no frontmatter block at all.
 */
export function parseFrontmatterRow(content: string): Record<string, unknown> | null {
  const fm = extractFrontmatter(content)
  if (!fm) return null
  const lines = fm.body.split('\n')
  const row: Record<string, unknown> = {}
  const FIELD_RE = /^([A-Za-z_][A-Za-z0-9_-]*):[ \t]*(.*)$/
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const m = line.match(FIELD_RE)
    if (!m) continue
    const key = m[1]!
    const rest = (m[2] ?? '').trim()
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim()
      row[key] = inner === '' ? [] : inner.split(',').map(s => unquoteScalar(s.trim()))
      continue
    }
    if (rest !== '') {
      row[key] = unquoteScalar(rest)
      continue
    }
    // Empty tail: either a block list on subsequent indented `- ` lines, or
    // a genuinely empty scalar field.
    const items: string[] = []
    let j = i + 1
    for (; j < lines.length; j++) {
      const l = lines[j] ?? ''
      if (/^\s+-\s/.test(l)) { items.push(unquoteScalar(l.trim().replace(/^-\s*/, ''))); continue }
      if (l === '' || /^\s/.test(l)) continue
      break
    }
    if (items.length > 0) {
      row[key] = items
      i = j - 1
      continue
    }
    row[key] = ''
  }
  return row
}
