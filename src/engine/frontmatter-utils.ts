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
const KV_RE = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/

// A block-style YAML list under a key, e.g.:
//   - a plain string item, one or more lines wrapped: `- "text\n    more."`
//   - an object item, one or more `key: value` lines: `- name: x\n    kind: y`
// Each `- ` line opens a new item; a following indented line that is NOT
// itself `- `-prefixed is a continuation of the CURRENT item: appended as
// wrapped text if the item is a plain string, or, for an object item,
// appended to whichever key was most recently set if the line isn't itself
// `key: value`-shaped (a wrapped continuation of that key's own value,
// never silently dropped) or added as a new key if it is. Text per string
// item / per object key is accumulated raw and unquoted once, on flush, so
// a value split across lines by an opening quote never gets unquoted
// piecemeal. Returns the parsed items and the index of the last line
// consumed.
function parseBlockList(lines: string[], startIdx: number): { items: unknown[]; endIdx: number } {
  const items: unknown[] = []
  let stringParts: string[] | null = null
  let objParts: Record<string, string[]> | null = null
  let objKeyOrder: string[] = []
  let lastObjKey: string | null = null

  const flush = () => {
    if (stringParts !== null) {
      items.push(unquoteScalar(stringParts.join(' ').trim()))
    } else if (objParts !== null) {
      const obj: Record<string, string> = {}
      for (const k of objKeyOrder) obj[k] = unquoteScalar((objParts[k] ?? []).join(' ').trim())
      items.push(obj)
    }
    stringParts = null
    objParts = null
    objKeyOrder = []
    lastObjKey = null
  }

  let j = startIdx
  for (; j < lines.length; j++) {
    const l = lines[j] ?? ''
    const dash = /^\s+-\s?(.*)$/.exec(l)
    if (dash) {
      flush()
      const rest = dash[1] ?? ''
      const kv = KV_RE.exec(rest)
      if (kv) {
        objParts = {}
        objKeyOrder = [kv[1]!]
        objParts[kv[1]!] = [(kv[2] ?? '').trim()]
        lastObjKey = kv[1]!
      } else {
        stringParts = [rest]
      }
      continue
    }
    if (l.trim() === '') continue
    if (/^\s/.test(l)) {
      const trimmed = l.trim()
      if (objParts !== null) {
        const kv = KV_RE.exec(trimmed)
        if (kv) {
          objKeyOrder.push(kv[1]!)
          objParts[kv[1]!] = [(kv[2] ?? '').trim()]
          lastObjKey = kv[1]!
        } else if (lastObjKey !== null) {
          objParts[lastObjKey]!.push(trimmed)
        }
        continue
      }
      if (stringParts !== null) { stringParts.push(trimmed); continue }
      continue
    }
    break
  }
  flush()
  return { items, endIdx: j }
}

// Position of the `]` that balances the array's opening `[`, scanning by
// depth rather than "the last `]` on the accumulated text" so a trailing
// YAML comment or extra text after a properly-closed array never extends
// or corrupts the match. Returns -1 if the brackets never balance.
function findBalancedClose(s: string): number {
  let depth = 0
  for (let idx = 0; idx < s.length; idx++) {
    if (s[idx] === '[') depth++
    else if (s[idx] === ']') { depth -= 1; if (depth === 0) return idx }
  }
  return -1
}

// The line-level parse loop, split out from parseFrontmatterRow so
// parse-formats.ts's parse="yaml" (class 3 composition work) can run the
// exact same flat top-level-key, scalar/inline-list/block-list subset
// against a bare document with no `---` fence, rather than reimplementing
// it. Same scope limits as the frontmatter reader this was extracted
// from: top-level keys only, no nested objects, documented at this
// module's own header comment.
export function parseYamlLines(lines: string[]): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const m = KV_RE.exec(line)
    if (!m) continue
    const key = m[1]!
    const rest = (m[2] ?? '').trim()
    if (rest.startsWith('[')) {
      // Inline bracket array, single-line (`[a, b]`) or wrapped across
      // multiple physical lines (`[a, b,\n  c, d]`): accumulate by tracked
      // bracket depth, not "the line ends with ]", so a trailing comment
      // after a properly-closed array never extends accumulation. Bail out
      // WITHOUT consuming a line that looks like a genuine new top-level
      // field (this parser's own convention: always flush-left, `KV_RE`
      // matches from column 0) rather than silently absorbing the rest of
      // the frontmatter block into one garbled value when the array is
      // truly left unclosed.
      let acc = rest
      let k = i
      while (findBalancedClose(acc) === -1 && k + 1 < lines.length) {
        const next = lines[k + 1] ?? ''
        if (KV_RE.test(next)) break
        k += 1
        acc += ' ' + next.trim()
      }
      const closeIdx = findBalancedClose(acc)
      if (closeIdx === -1) {
        // Never balanced: contained fallback for just this one field,
        // matching the pre-fix single-line behavior, never swallows
        // anything past it.
        row[key] = unquoteScalar(rest)
        continue
      }
      const inner = acc.slice(1, closeIdx).trim()
      row[key] = inner === '' ? [] : inner.split(',').map(s => unquoteScalar(s.trim()))
      i = k
      continue
    }
    if (rest !== '') {
      row[key] = unquoteScalar(rest)
      continue
    }
    // Empty tail: either a block list on subsequent indented lines, or a
    // genuinely empty scalar field.
    const { items, endIdx } = parseBlockList(lines, i + 1)
    if (items.length > 0) {
      row[key] = items
      i = endIdx - 1
      continue
    }
    row[key] = ''
  }
  return row
}

export function parseFrontmatterRow(content: string): Record<string, unknown> | null {
  const fm = extractFrontmatter(content)
  if (!fm) return null
  return parseYamlLines(fm.body.split('\n'))
}
