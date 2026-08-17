import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, isAbsolute } from 'node:path'
import { execSync } from 'node:child_process'
import type { ListNode, ReadNode, CountNode, DateNode, TreeNode, QueryNode } from 'livestage/parser'
import type { EngineContext } from './context.js'
import { checkDataPath } from './security/filesystem.js'
import { checkShellCommand } from './security/shell.js'
import { expandPattern } from './security/path-expand.js'
import { interpolatePathSoft, interpolateShellSafe } from './engine-include.js'
import { globToRegex, walkDir, listJson, listCsv, readEnvFile, hasGlobChars, resolveGlobTargets, whereMatches } from './sources-file-utils.js'
import { parseFrontmatterRow, extractFrontmatter } from './frontmatter-utils.js'
import { withDirectiveCache } from './directive-cache.js'

/**
 * Resolve and security-check a data-op path. Returns the absolute path if
 * allowed, or null if blocked (with a SECURITY_ALERT warning already pushed).
 * v2.0: jails against dataJail (default: cwd), honors allowedDataPaths.
 */
export function resolveDataPath(path: string, ctx: EngineContext, directive: string): string | null {
  const dataJail = ctx.security.dataJail ?? ctx.security.jailRoot ?? ctx.docDir
  if (!dataJail) {
    ctx.warnings.push(`SECURITY_ALERT: ${directive} no data jail configured: ${path}`)
    return null
  }
  // Expand the path before resolving, mirroring @query (and the read-ops
  // fix). Without this, `${CLAUDE_SKILL_DIR}`, `${CWD}`, `${HOME}`, a leading
  // `~/`, and `{{ }}` interpolations stay literal in @list/@read/@count/@tree
  // paths, so a flow installed at ~/.claude/mdd2/ that lists its own skill
  // tree (`@list ${CLAUDE_SKILL_DIR}/flows`) silently matches nothing.
  const expandedPath = expandPattern(interpolatePathSoft(path, ctx), {
    env: { ...ctx.env, ...ctx.envFiles },
    skillDir: ctx.skillContext?.skillDir ?? '',
    sessionId: ctx.skillContext?.sessionId ?? '',
  })
  const full = isAbsolute(expandedPath) ? expandedPath : resolve(dataJail, expandedPath)
  const check = checkDataPath(full, dataJail, ctx.security.allowedDataPaths, ctx.security.filesystemConfig)
  if (check.level === 'blocked') {
    ctx.warnings.push(`SECURITY_ALERT: ${directive} path blocked - ${check.reason}: ${path}`)
    return null
  }
  if (check.level === 'alert') {
    ctx.warnings.push(`SECURITY_ALERT: ${directive} sensitive path accessed - ${check.reason}: ${path}`)
  }
  return full
}

// `field != []` / `field == []` compares by reference in real JS and would
// be vacuously true/false always; rewritten to a length check so the
// emptiness predicate feature 36's own business rule 1 documents
// (`known_issues != []`) actually filters correctly. Scoped to the
// frontmatter query path only, whereMatches' generic JSON/CSV where= eval
// (feature 17) is untouched.
function preprocessArrayEmptiness(expr: string): string {
  return expr
    .replace(/([A-Za-z_][A-Za-z0-9_.]*)\s*!=\s*\[\s*\]/g, '$1.length > 0')
    .replace(/([A-Za-z_][A-Za-z0-9_.]*)\s*==\s*\[\s*\]/g, '$1.length === 0')
}

// An array item can itself be an object now that parseFrontmatterRow
// parses block-list-of-objects fields (primitives, satisfies_contracts,
// integration_contracts) into real objects rather than raw strings.
// Array.prototype.join falls back to a plain object's default toString,
// "[object Object]", so each object item is rendered as its own
// space-separated key=value pairs instead.
function stringifyListItem(item: unknown): string {
  if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
    return Object.entries(item as Record<string, unknown>).map(([k, v]) => `${k}=${v}`).join(' ')
  }
  return String(item ?? '')
}

function frontmatterRowToTabLine(row: Record<string, unknown>, fields: string[]): string {
  return fields.map(f => {
    const v = row[f]
    return Array.isArray(v) ? v.map(stringifyListItem).join(', ') : String(v ?? '')
  }).join('\t')
}

// Business rule 6: nested-array frontmatter (an object per list item, e.g.
// `satisfies_contracts[0].status`) is deliberately out of scope for `where=`
// (parseFrontmatterRow only captures flat top-level fields, feature 36's
// donor scope). Without this check a query like that would silently
// evaluate against a mangled flattened row and return a wrong-but-plausible
// answer instead of failing loudly, so it is detected and refused up front.
const NESTED_ARRAY_RE = /[A-Za-z_][A-Za-z0-9_]*\s*\[\s*\d+\s*\]\s*\./

// F-FM-QUERY (feature 36): @list over a glob with where=/fields= queries
// each matched file's frontmatter instead of listing directory entries.
// where= filters; fields= projects a header row + tab rows shaped for
// `| @render table`. Neither present falls through to the plain listing
// below (this path is opt-in, not a replacement for @list's existing
// directory/JSON/CSV behavior).
function executeFrontmatterQuery(pathGlob: string, args: Record<string, string>, ctx: EngineContext): string[] {
  const files = resolveGlobTargets(pathGlob, p => resolveDataPath(p, ctx, '@list'))
  const rawWhere = args['where']
  if (rawWhere && NESTED_ARRAY_RE.test(rawWhere)) {
    ctx.warnings.push(`@list where=: nested-array frontmatter queries are not supported ("${rawWhere}"); walk it with a @code block instead`)
    return []
  }
  const whereExpr = rawWhere ? preprocessArrayEmptiness(rawWhere) : null
  // arg0..arg3/args/vars (F-ARGS, feature 23) are bound as real variables
  // in the where= evaluation scope, never text-spliced into the expression
  // string itself: `where="id == arg0"` reads arg0 as data, the same way a
  // frontmatter field is referenced by bare name. Untrusted caller input
  // (--args/--var, or a passive hook render's skill $ARGUMENTS) must never
  // become part of the evaluated expression's own text, that path is a
  // straight JS-injection sink into whereMatches' runInNewContext eval.
  const skill = ctx.skillContext
  const argsList = skill?.argsList ?? []
  const whereExtra: Record<string, unknown> = {
    args: skill?.args ?? '',
    argsList,
    arg0: argsList[0] ?? '',
    arg1: argsList[1] ?? '',
    arg2: argsList[2] ?? '',
    arg3: argsList[3] ?? '',
    vars: skill?.vars ?? {},
  }
  const fieldsSpec = args['fields']
  const fields = fieldsSpec ? fieldsSpec.split(',').map(f => f.trim()) : null

  const matched: string[] = []
  const rows: Record<string, unknown>[] = []
  for (const file of files) {
    let content: string
    try { content = readFileSync(file, 'utf8') } catch { continue }
    const row = parseFrontmatterRow(content)
    if (row === null) continue
    if (whereExpr && !whereMatches(row, whereExpr, whereExtra)) continue
    matched.push(file)
    rows.push(row)
  }

  if (!fields) return matched

  const lines = [fields.join('\t')]
  for (const row of rows) lines.push(frontmatterRowToTabLine(row, fields))
  return lines
}

export function executeList(node: ListNode, ctx: EngineContext): string[] {
  const whereExpr = node.args['where']
  const fieldsSpec = node.args['fields']
  if (hasGlobChars(node.path) && (whereExpr || fieldsSpec)) {
    return executeFrontmatterQuery(node.path, node.args, ctx)
  }

  // Path resolution (and its security check) always runs live, cache hit or
  // not: only the read/parse work below is what a session/persist cache
  // hit skips, never the jail check.
  const full = resolveDataPath(node.path, ctx, '@list')
  if (!full) return []

  return withDirectiveCache('list', node.cache, { path: node.path, args: node.args }, ctx, () => {
    const ext = node.path.toLowerCase()
    if (ext.endsWith('.json')) return listJson(full, node.args)
    if (ext.endsWith('.csv')) return listCsv(full, node.args)

    const matchPattern = node.args['match']
    const matchRe = matchPattern ? globToRegex(matchPattern) : null
    const typeFilter = node.args['type'] ?? 'files'
    const depthStr = node.args['depth']
    const maxDepth = depthStr !== undefined ? parseInt(depthStr, 10) : -1
    const base = node.path.replace(/\/$/, '')
    return walkDir(full, '', matchRe, typeFilter, 0, maxDepth).map(r => `${base}/${r}`)
  })
}

// Structured-access options only mean something for their own file type:
// path=/mode=/collapse= are JSON options, column=/skip= are CSV-only,
// columns=/where= apply to both. A mismatched option (found live: @read
// with column= against a JSON file, or path= against a CSV) used to fall
// through to a raw-content read with no warning, silently ignoring the
// attribute the caller wrote, rather than either honoring it or saying so.
const JSON_ONLY_OPTIONS = ['path', 'mode', 'collapse']
const CSV_ONLY_OPTIONS = ['column', 'skip']
const STRUCTURED_OPTIONS = [...JSON_ONLY_OPTIONS, ...CSV_ONLY_OPTIONS, 'columns', 'where']

function warnUnusedOption(ctx: EngineContext, path: string, node: ReadNode, options: string[], fileKind: string): void {
  const givenOption = options.find(opt => node.args[opt] !== undefined)
  if (givenOption) {
    ctx.warnings.push(`@read: "${givenOption}=" does not apply to a ${fileKind} file (${path}); the option is ignored`)
  }
}

export function executeRead(node: ReadNode, ctx: EngineContext): string[] {
  // Path resolution (and its security check) always runs live, cache hit or
  // not: only the read/parse work below is what a session/persist cache
  // hit skips, never the jail check.
  const full = resolveDataPath(node.path, ctx, '@read')
  if (!full) return []

  return withDirectiveCache('read', node.cache, { path: node.path, args: node.args }, ctx, () => {
    const ext = node.path.toLowerCase()
    if (ext.endsWith('.json')) {
      warnUnusedOption(ctx, node.path, node, CSV_ONLY_OPTIONS, 'JSON')
      return listJson(full, node.args)
    }
    if (ext.endsWith('.csv')) {
      warnUnusedOption(ctx, node.path, node, JSON_ONLY_OPTIONS, 'CSV')
      return listCsv(full, node.args)
    }
    if (ext.endsWith('.env')) return readEnvFile(full, node.args)
    const givenOption = STRUCTURED_OPTIONS.find(opt => node.args[opt] !== undefined)
    if (givenOption) {
      ctx.warnings.push(`@read: "${givenOption}=" only applies to .json/.csv files, ${node.path} is neither; falling back to a raw content read, the option is ignored`)
    }
    try {
      return readFileSync(full, 'utf8').split('\n').filter(l => l !== '')
    } catch { return [] }
  })
}

/**
 * Parse a wave/feature brief into labeled fields. A brief is a markdown
 * block whose paragraphs start with a bold label like `**Purpose.**` or
 * `**Definition of Done.**`. Each label opens a section; the next bold
 * label closes it.
 *
 * Returns a struct keyed by snake_case label name. The label "Definition
 * of Done" becomes `definition_of_done`. Trailing periods, leading/trailing
 * whitespace, and the original `**...**` markers are stripped from values.
 *
 * Used by Phase 3 of build flows to seed the feature-doc template's intent
 * fields (purpose, business_rules, definition_of_done) from the wave brief
 * the engine extracted via read_section, so the first draft is structured
 * rather than dumping the whole brief into a single field.
 */
export function parseFeatureBrief(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  const src = String(text ?? '')
  if (!src) return result
  // Match `**Label.**` (or `**Label (qualifier).**`) at line start. Capture
  // the label text inside the bold markers, strip trailing period before
  // snake_case-ing. Allow any non-bold content between matches.
  const LABEL_RE = /^\*\*([^*]+?)\*\*\s*/gm
  type Match = { label: string; start: number; bodyStart: number }
  const matches: Match[] = []
  let m: RegExpExecArray | null
  while ((m = LABEL_RE.exec(src)) !== null) {
    matches.push({ label: m[1] ?? '', start: m.index, bodyStart: m.index + m[0].length })
  }
  if (matches.length === 0) return result
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]!
    const next = matches[i + 1]
    const end = next ? next.start : src.length
    const rawLabel = cur.label.trim().replace(/\.$/, '')
    const key = rawLabel
      .toLowerCase()
      .replace(/\s*\([^)]*\)\s*$/, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
    if (!key) continue
    const body = src.slice(cur.bodyStart, end).trim()
    result[key] = body
  }
  return result
}

/**
 * Pull backtick-wrapped file paths out of a markdown string. Used by build
 * Phase 3b to extract `src/foo.ts`-style paths from a wave brief's
 * **Source files.** paragraph (e.g. "`src/rules/parser.ts`,
 * `src/rules/loader.ts`, ..."). Only matches strings inside single backticks
 * that contain a dot followed by a 1-6 char alphabetic extension, avoids
 * picking up unrelated backtick spans like `@constraint id`. Returns each
 * matched path in source order.
 */
export function extractFilePaths(text: string): string[] {
  const src = String(text ?? '')
  if (!src) return []
  const matches = Array.from(src.matchAll(/`([^`\s]+\.[A-Za-z]{1,6})`/g))
  return matches.map(m => m[1] ?? '').filter(p => p.length > 0)
}

/**
 * Extract a markdown section by heading substring match. Given an absolute
 * file path and a needle, finds the first ATX heading whose text contains
 * the needle (case-insensitive) and returns that heading line plus body
 * up to the next heading at the same level or higher. Returns '' on miss.
 *
 * Used by the `read_section(path, heading_contains)` sandbox builtin so
 * flows can inline a single section of a wave/feature doc without Claude
 * touching the raw file. Matches headings #1 through #6.
 */
export function readMarkdownSection(absPath: string, headingContains: string): string {
  const needle = String(headingContains ?? '').trim().toLowerCase()
  if (!needle) return ''
  let content: string
  try { content = readFileSync(absPath, 'utf8') } catch { return '' }
  const lines = content.split('\n')
  let startIdx = -1
  let startLevel = 0
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.*)$/.exec(lines[i] ?? '')
    if (!m) continue
    const headingText = (m[2] ?? '').trim()
    if (headingText.toLowerCase().includes(needle)) {
      startIdx = i
      startLevel = (m[1] ?? '').length
      break
    }
  }
  if (startIdx === -1) return ''
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i] ?? '')
    if (m && (m[1] ?? '').length <= startLevel) {
      endIdx = i
      break
    }
  }
  return lines.slice(startIdx, endIdx).join('\n').trim()
}

/**
 * Read a markdown file's whole prose body, blank lines preserved. Neither
 * `@read` (whole file including frontmatter, blank lines stripped) nor
 * `readMarkdownSection` (requires a heading, returns '' for the whole
 * thing) covers this. Given a heading, delegates to `readMarkdownSection`
 * for exact behavioral parity with what `read_section()` already returns.
 * Returns '' on read failure; if the file has no frontmatter block,
 * returns the whole trimmed content.
 */
export function readMarkdownBody(absPath: string, headingContains?: string): string {
  // headingContains !== undefined (not truthy) so an explicitly-empty
  // heading (as opposed to omitted) still delegates to readMarkdownSection
  // and gets its '' miss behavior, exact parity with read_section(path, '').
  if (headingContains !== undefined) return readMarkdownSection(absPath, headingContains)
  let content: string
  try { content = readFileSync(absPath, 'utf8') } catch { return '' }
  // extractFrontmatter's delimiter regex is LF-only; normalize CRLF first or
  // a Windows-authored file's frontmatter block silently fails to match and
  // gets emitted whole, credentials and all, as if it were plain body text.
  content = content.replace(/\r\n/g, '\n')
  const fm = extractFrontmatter(content)
  const body = fm ? content.slice(fm.fullBlock.length) : content
  return body.trim()
}

export function formatDate(date: Date, fmt: string): string {
  if (fmt === 'ISO') return date.toISOString()
  if (fmt === 'date') return date.toISOString().split('T')[0] ?? ''
  const offMin = -date.getTimezoneOffset()
  const sign = offMin >= 0 ? '+' : '-'
  const offH = Math.floor(Math.abs(offMin) / 60).toString().padStart(2, '0')
  const offM = (Math.abs(offMin) % 60).toString().padStart(2, '0')
  const tzAbbr = Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date).find(p => p.type === 'timeZoneName')?.value ?? 'UTC'
  const h12 = date.getHours() % 12 || 12
  const tokens: [string, string][] = [
    ['YYYY', String(date.getFullYear())],
    ['MM',   String(date.getMonth() + 1).padStart(2, '0')],
    ['DD',   String(date.getDate()).padStart(2, '0')],
    ['HH',   String(date.getHours()).padStart(2, '0')],
    ['hh',   String(h12).padStart(2, '0')],
    ['mm',   String(date.getMinutes()).padStart(2, '0')],
    ['ss',   String(date.getSeconds()).padStart(2, '0')],
    ['zzz',  tzAbbr],
    ['ZZ',   `${sign}${offH}${offM}`],
    ['Z',    `${sign}${offH}:${offM}`],
    ['A',    date.getHours() < 12 ? 'AM' : 'PM'],
    ['a',    date.getHours() < 12 ? 'am' : 'pm'],
    ['h',    String(h12)],
    ['z',    tzAbbr],
    ['X',    String(Math.floor(date.getTime() / 1000))],
    ['x',    String(date.getTime())],
  ]
  let result = fmt
  for (const [token, value] of tokens) result = result.split(token).join(value)
  return result
}

export function executeCount(node: CountNode, ctx: EngineContext): string[] {
  const full = resolveDataPath(node.path, ctx, '@count')
  if (!full) return ['0']
  try {
    const st = statSync(full)
    if (st.isDirectory()) {
      const matchPattern = node.args['match']
      const matchRe = matchPattern ? globToRegex(matchPattern) : null
      const typeFilter = node.args['type'] ?? 'files'
      return [String(walkDir(full, '', matchRe, typeFilter, 0, -1).length)]
    }
    return [String(readFileSync(full, 'utf8').split('\n').length)]
  } catch { return ['0'] }
}

export function executeDate(node: DateNode, ctx?: EngineContext): string[] {
  const fmt = node.args['format'] ?? 'ISO'
  const filePath = node.args['file']
  const type = node.args['type'] ?? 'current'
  if (type === 'created') {
    throw new Error('@date: type="created" is not supported, file creation time is not reliably available across platforms')
  }
  let date = ctx?.determinism?.now ?? new Date()
  if (type === 'modified' && filePath && ctx) {
    const abs = resolveDataPath(filePath, ctx, '@date file=')
    if (abs) {
      try { date = new Date(statSync(abs).mtime) } catch { /* fallback to now */ }
    }
  } else if (type === 'modified' && filePath) {
    try { date = new Date(statSync(filePath).mtime) } catch { /* fallback to now */ }
  }
  return [formatDate(date, fmt)]
}

export function buildTree(dir: string, prefix: string, matchRe: RegExp | null, depth: number, maxDepth: number): string[] {
  if (maxDepth >= 0 && depth > maxDepth) return []
  let entries: import('node:fs').Dirent[]
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return [] }
  const lines: string[] = []
  entries.forEach((entry, i) => {
    if (matchRe && !entry.isDirectory() && !matchRe.test(entry.name)) return
    const isLast = i === entries.length - 1
    lines.push(prefix + (isLast ? '└── ' : '├── ') + entry.name)
    if (entry.isDirectory()) {
      lines.push(...buildTree(join(dir, entry.name), prefix + (isLast ? '    ' : '│   '), matchRe, depth + 1, maxDepth))
    }
  })
  return lines
}

export function executeTree(node: TreeNode, ctx: EngineContext): string[] {
  const full = resolveDataPath(node.path, ctx, '@tree')
  if (!full) return []
  return withDirectiveCache('tree', node.cache, { path: node.path, args: node.args }, ctx, () => {
    const matchPattern = node.args['match']
    const matchRe = matchPattern ? globToRegex(matchPattern) : null
    const depthStr = node.args['depth']
    const maxDepth = depthStr !== undefined ? parseInt(depthStr, 10) : -1
    return buildTree(full, '', matchRe, 0, maxDepth)
  })
}

export function executeQuery(node: QueryNode, ctx: EngineContext): string[] {
  if (!ctx.security.allowShell) return []  // jailed: stripped silently

  // Mock cache: serve from local file without spawning a process
  if (node.cache?.mode === 'mock' && node.cache.mockPath) {
    const mockFull = resolveDataPath(node.cache.mockPath, ctx, '@query mock')
    if (!mockFull) return []
    try { return readFileSync(mockFull, 'utf8').split('\n').filter(l => l !== '') }
    catch { return [] }
  }

  if (!node.command) { ctx.warnings.push('@query: empty command, skipped'); return [] }

  // Resolve {{ expr }} interpolations and ${VAR} expansions in the command
  // string before checking security + executing. Without this, flows that
  // use `@query "ls *{{ feature_slug }}*"` would run literal "{{ }}" text
  // as a shell glob (no match, silent miss). interpolateShellSafe handles
  // the {{ }} (shell-quoting the resolved value, see B1: an unquoted
  // splice let a resolved value chain further commands past an allowed
  // allowlist prefix); expandPattern handles ${CWD}/${HOME}/${VAR}.
  const interpolated = interpolateShellSafe(node.command, ctx)
  const command = expandPattern(interpolated, {
    env: { ...ctx.env, ...ctx.envFiles },
    skillDir: ctx.skillContext?.skillDir ?? '',
    sessionId: ctx.skillContext?.sessionId ?? '',
  })

  if (ctx.security.shellConfig) {
    const shellCheck = checkShellCommand(command, ctx.security.shellConfig)
    if (!shellCheck.allowed) {
      const prefix = shellCheck.tier === 'always_block' ? 'SECURITY_ALERT' : 'WARN'
      const cmdPreview = command.length > 80 ? command.slice(0, 77) + '...' : command
      ctx.warnings.push(`${prefix}: @query command blocked [${shellCheck.tier}], ${shellCheck.reason}: \`${cmdPreview}\``)
      return []
    }
  }

  // Every security check above already ran live; only the actual spawn is
  // what a session/persist cache hit skips.
  return withDirectiveCache('query', node.cache, { command }, ctx, () => {
    try {
      const out = execSync(command, { cwd: ctx.cwd, encoding: 'utf8', timeout: 10_000 })
      return out.split('\n').filter(l => l !== '')
    } catch {
      ctx.warnings.push(`@query: command failed, "${command}"`)
      return []
    }
  })
}
