// @code parse=: turns a script's raw stdout into one internal
// representation (an array of objects, a plain object, an array of
// strings, or a plain string), the same shape every @render format and
// @foreach already knows how to work with. One parser per format, no
// per-format render paths downstream, everything after this point is
// generic.
//
// Typing policy (deliberate, documented): CSV/TSV carry no types of their
// own, every cell stays a string unless coerce= explicitly asks for a
// conversion. Silent coercion here is the exact class of bug a database
// client silently turning a date into a string is; opt in, don't guess.

import { parseYamlLines } from './frontmatter-utils.js'

export type ParseFormat = 'text' | 'json' | 'ndjson' | 'csv' | 'tsv' | 'xml' | 'yaml' | 'lines'

const VALID_FORMATS: ParseFormat[] = ['text', 'json', 'ndjson', 'csv', 'tsv', 'xml', 'yaml', 'lines']

export function isParseFormat(value: string): value is ParseFormat {
  return (VALID_FORMATS as string[]).includes(value)
}

export interface CoerceOptions {
  numbers: boolean
  booleans: boolean
}

export function parseCoerceSpec(spec: string | undefined): CoerceOptions {
  const parts = (spec ?? '').split(',').map(s => s.trim()).filter(Boolean)
  return { numbers: parts.includes('numbers'), booleans: parts.includes('booleans') }
}

function coerceValue(raw: string, opts: CoerceOptions): unknown {
  if (opts.booleans && (raw === 'true' || raw === 'false')) return raw === 'true'
  if (opts.numbers && raw.trim() !== '' && !isNaN(Number(raw))) return Number(raw)
  return raw
}

// Same convention as executeSource's piped `code` case (engine.ts): the
// script's own trailing newline (console.log/print) is dropped as an
// artifact of the runner, not treated as an intentional final blank row;
// interior empty lines are kept.
function parseLines(stdout: string): string[] {
  if (stdout === '') return []
  const lines = stdout.split('\n')
  if (lines[lines.length - 1] === '') lines.pop()
  return lines
}

function parseJsonStrict(stdout: string): unknown {
  try {
    return JSON.parse(stdout)
  } catch (err) {
    throw new Error(`@code: parse="json" but stdout is not valid JSON: ${String(err)}`)
  }
}

function parseNdjson(stdout: string): unknown[] {
  const lines = stdout.split('\n').filter(l => l.trim() !== '')
  return lines.map((line, i) => {
    try {
      return JSON.parse(line)
    } catch (err) {
      throw new Error(`@code: parse="ndjson" line ${i + 1} is not valid JSON: ${String(err)}`)
    }
  })
}

// Quote-aware single-char-delimiter line split, the same algorithm CSV
// parsing already uses elsewhere in this codebase (sources-file-utils.ts's
// listCsv), generalized to a delimiter parameter and reused for TSV too.
// TSV files rarely quote fields (the delimiter itself is a control
// character unlikely to appear literally), but honoring a quoted cell
// costs nothing and avoids a second, subtly different parser.
function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuote = false
  for (const ch of line) {
    if (inQuote) {
      if (ch === '"') inQuote = false
      else cur += ch
    } else if (ch === '"') {
      inQuote = true
    } else if (ch === delimiter) {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

function parseDelimited(stdout: string, delimiter: string, coerce: CoerceOptions): Record<string, unknown>[] {
  const lines = stdout.split('\n').filter(l => l.trim() !== '')
  if (lines.length === 0) return []
  const headers = parseDelimitedLine(lines[0]!, delimiter)
  return lines.slice(1).map(line => {
    const cells = parseDelimitedLine(line, delimiter)
    const row: Record<string, unknown> = {}
    headers.forEach((h, i) => { row[h] = coerceValue(cells[i] ?? '', coerce) })
    return row
  })
}

// Minimal XML reader, deliberately scoped (documented, not a gap found
// later): elements, attributes, and text content only. No CDATA, no
// namespaces, no processing instructions, no DOCTYPE, no entities beyond
// the five XML predefines (&amp; &lt; &gt; &quot; &apos;) and numeric
// (&#NN; / &#xHH;) references. Comments (<!-- ... -->) are stripped.
// Shape: a leaf element (no child elements) becomes its trimmed text as a
// plain string; an element with children becomes an object keyed by child
// tag name, repeated tags collapsing into an array; attributes land under
// a `_attrs` key alongside the children (or alongside `_text` for a leaf
// that also carries attributes, since a bare string has nowhere else to
// put them). The document's root tag is kept as the single top-level key,
// matching the common xml2js convention, so the shape mirrors the source.
interface XmlElement {
  tag: string
  attrs: Record<string, string>
  children: XmlElement[]
  text: string
}

const XML_TAG_RE = /<([^!?/][^>]*?)\/?>|<\/([^>]+)>/g
const ATTR_RE = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"|([A-Za-z_:][\w:.-]*)\s*=\s*'([^']*)'/g

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function stripXmlNoise(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
}

function parseXmlElement(xml: string, pos: { i: number }): XmlElement | null {
  XML_TAG_RE.lastIndex = pos.i
  const m = XML_TAG_RE.exec(xml)
  if (!m) throw new Error('@code: parse="xml" but no element found (malformed or empty XML)')
  const openMatch = m[1]
  const closeMatch = m[2]
  if (closeMatch !== undefined) {
    throw new Error(`@code: parse="xml" unexpected closing tag </${closeMatch}> with no matching open tag`)
  }
  const selfClosing = xml[m.index + m[0].length - 2] === '/'
  const spaceIdx = openMatch!.search(/\s/)
  const tag = (spaceIdx === -1 ? openMatch! : openMatch!.slice(0, spaceIdx)).replace(/\/$/, '')
  const attrText = spaceIdx === -1 ? '' : openMatch!.slice(spaceIdx)
  const attrs: Record<string, string> = {}
  for (const am of attrText.matchAll(ATTR_RE)) {
    const name = am[1] ?? am[3]!
    const value = decodeXmlEntities(am[2] ?? am[4] ?? '')
    attrs[name] = value
  }
  pos.i = m.index + m[0].length
  if (selfClosing) return { tag, attrs, children: [], text: '' }

  const children: XmlElement[] = []
  let text = ''
  for (;;) {
    XML_TAG_RE.lastIndex = pos.i
    const next = XML_TAG_RE.exec(xml)
    if (!next) throw new Error(`@code: parse="xml" unterminated element <${tag}>`)
    text += xml.slice(pos.i, next.index)
    if (next[2] !== undefined) {
      // Closing tag.
      if (next[2] !== tag) {
        throw new Error(`@code: parse="xml" mismatched close tag </${next[2]}>, expected </${tag}>`)
      }
      pos.i = next.index + next[0].length
      return { tag, attrs, children, text: decodeXmlEntities(text) }
    }
    // Another open tag: a child element, parse recursively from here.
    const child = parseXmlElement(xml, pos)
    if (child) children.push(child)
  }
}

function xmlElementToValue(el: XmlElement): unknown {
  const hasAttrs = Object.keys(el.attrs).length > 0
  if (el.children.length === 0) {
    const trimmed = el.text.trim()
    return hasAttrs ? { _attrs: el.attrs, _text: trimmed } : trimmed
  }
  const obj: Record<string, unknown> = hasAttrs ? { _attrs: el.attrs } : {}
  for (const child of el.children) {
    const value = xmlElementToValue(child)
    if (child.tag in obj) {
      const existing = obj[child.tag]
      if (Array.isArray(existing)) existing.push(value)
      else obj[child.tag] = [existing, value]
    } else {
      obj[child.tag] = value
    }
  }
  return obj
}

function parseXml(stdout: string): unknown {
  const cleaned = stripXmlNoise(stdout)
  const pos = { i: 0 }
  // Skip leading whitespace before the first tag.
  while (pos.i < cleaned.length && /\s/.test(cleaned[pos.i]!)) pos.i++
  const root = parseXmlElement(cleaned, pos)
  if (!root) throw new Error('@code: parse="xml" but stdout has no root element')
  return { [root.tag]: xmlElementToValue(root) }
}

export function parseCodeOutput(stdout: string, format: ParseFormat, coerce: CoerceOptions): unknown {
  switch (format) {
    case 'text': return stdout
    case 'json': return parseJsonStrict(stdout)
    case 'ndjson': return parseNdjson(stdout)
    case 'csv': return parseDelimited(stdout, ',', coerce)
    case 'tsv': return parseDelimited(stdout, '\t', coerce)
    case 'xml': return parseXml(stdout)
    case 'yaml': return parseYamlLines(parseLines(stdout))
    case 'lines': return parseLines(stdout)
  }
}
