// Kept in sync by hand with parser/parser.ts's own BUILTINS set, which
// classifies a pipe stage as builtin vs shell at parse time (see that
// file's comment for why the list can't just be imported from here).
const BUILTINS = new Set(['grep', 'sort', 'head', 'tail', 'wc', 'uniq', 'count-by'])
const MAX_GREP_PATTERN_LENGTH = 200
const REDOS_SUSPECT = /(\([^)]*[+*][^)]*\)[+*]|\(\?[^)]*\)[+*][+*]|\.\*.*\.\*)/

// A plain `split(/\s+/)` leaves matching quotes in place ('grep "a b"' would
// filter on the literal string '"a' followed by a separate token 'b"'), so
// any quoted pattern (the natural way to write one containing a space, or
// just out of habit) silently matched nothing with no error. Tokenizes
// shell-style: single/double-quoted spans are one token with the quotes
// stripped, unquoted runs split on whitespace.
function tokenize(command: string): string[] {
  const tokens: string[] = []
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(command)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3] ?? '')
  }
  return tokens
}

export function isBuiltin(command: string): boolean {
  const cmd = tokenize(command)[0] ?? ''
  return BUILTINS.has(cmd)
}

export function runBuiltin(command: string, lines: string[]): string[] {
  const parts = tokenize(command)
  const cmd = parts[0] ?? ''
  switch (cmd) {
    case 'grep': return runGrep(parts.slice(1), lines)
    case 'sort': return runSort(parts.slice(1), lines)
    case 'head': return lines.slice(0, parseCount(parts.slice(1), 10))
    case 'tail': return lines.slice(-parseCount(parts.slice(1), 10))
    case 'wc': {
      const flags = parts.slice(1)
      if (flags.includes('-w')) return [String(lines.join('\n').split(/\s+/).filter(Boolean).length)]
      if (flags.includes('-c')) return [String(lines.join('\n').length)]
      return [String(lines.length)]  // default: -l (line count)
    }
    case 'uniq': return lines.filter((l, i) => i === 0 || l !== lines[i - 1])
    case 'count-by': return runCountBy(parts.slice(1), lines)
    default: throw new Error(`Unknown built-in command: "${cmd}"`)
  }
}

function parseCount(args: string[], def: number): number {
  // Supports: `head 5` and `head -n 5`
  if (args[0] === '-n') return parseN(args[1], def)
  return parseN(args[0], def)
}

function parseN(raw: string | undefined, def: number): number {
  const n = parseInt(raw ?? '', 10)
  return isNaN(n) ? def : n
}

function runGrep(args: string[], lines: string[]): string[] {
  let caseInsensitive = false
  let negate = false
  const patternParts: string[] = []
  for (const arg of args) {
    if (arg === '-i') caseInsensitive = true
    else if (arg === '-v') negate = true
    else if (arg === '-iv' || arg === '-vi') { caseInsensitive = true; negate = true }
    else patternParts.push(arg)
  }
  const pattern = patternParts.join(' ')
  if (pattern.length > MAX_GREP_PATTERN_LENGTH) throw new Error(`grep: pattern too long (max ${MAX_GREP_PATTERN_LENGTH} chars)`)
  if (REDOS_SUSPECT.test(pattern)) throw new Error(`grep: pattern rejected (suspected ReDoS): ${pattern}`)
  let re: RegExp
  try {
    re = new RegExp(pattern, caseInsensitive ? 'i' : '')
  } catch {
    throw new Error(`grep: invalid pattern: ${pattern}`)
  }
  return lines.filter(l => negate ? !re.test(l) : re.test(l))
}

// count-by <field>: aggregates tab-separated rows by a named column,
// reading the column index from a header row (lines[0]), the same
// header-row convention @list's frontmatter query mode (feature 36) emits
// when fields= is given. Output rows are "value\tcount", most common first.
function runCountBy(args: string[], lines: string[]): string[] {
  const field = args[0]
  if (!field || lines.length === 0) return []
  const header = (lines[0] ?? '').split('\t').map(c => c.trim())
  const idx = header.indexOf(field)
  if (idx === -1) return []
  const counts = new Map<string, number>()
  for (const line of lines.slice(1)) {
    const cell = (line.split('\t')[idx] ?? '').trim()
    counts.set(cell, (counts.get(cell) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => `${value}\t${count}`)
}

function runSort(flags: string[], lines: string[]): string[] {
  const f = flags.join(' ')
  const sorted = [...lines]
  if (f.includes('n') && f.includes('r')) {
    sorted.sort((a, b) => Number(b.split(/\s+/)[0]) - Number(a.split(/\s+/)[0]))
  } else if (f.includes('n')) {
    sorted.sort((a, b) => Number(a.split(/\s+/)[0]) - Number(b.split(/\s+/)[0]))
  } else if (f.includes('r')) {
    sorted.sort((a, b) => b.localeCompare(a))
  } else {
    sorted.sort((a, b) => a.localeCompare(b))
  }
  return sorted
}
