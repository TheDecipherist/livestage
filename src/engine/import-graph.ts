import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import type { ImportGraphNode } from 'livestage/parser'
import type { EngineContext } from './context.js'
import { resolveDataPath } from './sources.js'
import { checkDataPath } from './security/filesystem.js'
import { resolveDataJail } from './file-access.js'

// @import-graph: walks any source tree given via src= and emits a Mermaid
// dependency graph of its internal module imports, no shell/@code grant
// needed (the walk and read go through the same data-path jail @list/@tree
// already use, checkDataPath via resolveDataPath).
//
// Ported from examples/import-graph/import-graph.js (a @code script that
// did exactly this for this project's own src/ tree, hardcoded), and
// generalized to work on an arbitrary directory: broader file-extension
// support (.ts/.tsx/.js/.jsx/.mjs/.cjs, not just .ts), directory-index
// resolution (./foo -> ./foo/index.ts), and no project-specific alias
// table. That last point is a real, deliberate accuracy trade-off: the
// original script hardcoded three tsconfig "paths" aliases
// (livestage/parser -> src/parser/index.ts, etc.) specific to THIS
// project; a generic directive pointed at an arbitrary directory has no
// way to know another project's path-alias config without also reading
// its tsconfig.json, which is future work, not this pass. Only relative
// (./...) specifiers resolve; bare-specifier self-aliases do not.

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage'])
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']

function walkSourceFiles(dir: string): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return []
  }
  const out: string[] = []
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (isDir) {
      out.push(...walkSourceFiles(full))
    } else if (SOURCE_EXTENSIONS.some(ext => name.endsWith(ext))) {
      out.push(full)
    }
  }
  return out
}

// Every import/export ... from '...' clause, single- or multi-line brace
// lists alike (the brace list is skipped non-greedily up to `from`), plus
// a bare `export * from '...'` / `export type * from '...'` re-export-all
// (no `as name` binding, only legal on the export side, but shared here
// since the alternative never matches `import * from`, which is not
// valid syntax). A real gap this alternative closes: found live via the
// import-graph ground-truth benchmark, src/renderer/index.ts's `export
// type * from './types.js'` was silently dropped because nothing else in
// that file also imported from './types.js' to accidentally match the
// `{...}` alternative instead (src/parser/index.ts has the identical
// `export type *` line but masked the same gap, a second `export {
// ParseError } from './types.js'` line right after it happened to match).
const FROM_CLAUSE = /(?:^|\n)\s*(?:import|export)(?:\s+type)?\s+(?:\{[\s\S]*?\}|\*\s+as\s+\w+|\*|\w+)\s+from\s+['"]([^'"]+)['"]/g
// Side-effect-only imports: import '...' (no `from`).
const BARE_IMPORT = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g
// TypeScript's inline type-only form, import('./x.js').SomeType, referencing
// a type with no top-level import statement. A real gap in a first draft of
// the source script this was ported from: one file's dependency on another
// existed only this way, no top-level import captured it (see the git log
// for "import-graph.js missed TypeScript's inline type-only import form").
const INLINE_TYPE_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

function extractSpecifiers(text: string): string[] {
  const specs: string[] = []
  for (const m of text.matchAll(FROM_CLAUSE)) specs.push(m[1]!)
  for (const m of text.matchAll(BARE_IMPORT)) specs.push(m[1]!)
  for (const m of text.matchAll(INLINE_TYPE_IMPORT)) specs.push(m[1]!)
  return specs
}

// Tries every source-extension/index-file variant of a single resolved
// base path, the shared last step of both the relative and alias
// resolvers. Returns the first real file found, or null.
function resolveCandidates(base: string): string | null {
  const stripped = SOURCE_EXTENSIONS.some(ext => base.endsWith(ext))
    ? base.slice(0, base.lastIndexOf('.'))
    : base
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map(ext => stripped + ext),
    ...SOURCE_EXTENSIONS.map(ext => join(base, 'index' + ext)),
    ...SOURCE_EXTENSIONS.map(ext => join(stripped, 'index' + ext)),
  ]
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

export interface TsPathsConfig {
  baseDir: string             // baseUrl, already resolved to an absolute directory
  paths: Record<string, string[]>  // pattern -> candidate targets, both may contain one '*'
}

// Reads compilerOptions.baseUrl/paths from a tsconfig-shaped JSON file
// (real tsconfig.json parsing only, no // comments or trailing commas,
// "shaped like" covers any JSON file with the same two fields, not a
// requirement that it literally be named tsconfig.json). baseUrl resolves
// relative to the config file's OWN directory, matching how tsc itself
// resolves it, not relative to src= or the .stage document.
function loadTsPathsConfig(configPath: string): TsPathsConfig | null {
  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const compilerOptions = (parsed as Record<string, unknown>)['compilerOptions']
  if (typeof compilerOptions !== 'object' || compilerOptions === null) return null
  const opts = compilerOptions as Record<string, unknown>
  const baseUrl = typeof opts['baseUrl'] === 'string' ? opts['baseUrl'] : '.'
  const rawPaths = opts['paths']
  const paths: Record<string, string[]> = {}
  if (typeof rawPaths === 'object' && rawPaths !== null) {
    for (const [pattern, targets] of Object.entries(rawPaths as Record<string, unknown>)) {
      if (Array.isArray(targets)) paths[pattern] = targets.filter((t): t is string => typeof t === 'string')
    }
  }
  if (Object.keys(paths).length === 0) return null
  return { baseDir: resolve(dirname(configPath), baseUrl), paths }
}

// Matches a bare specifier against tsconfig paths entries: an exact match
// wins outright; otherwise the first wildcard pattern ("foo/*") whose
// prefix the specifier starts with, substituting the captured remainder
// into each of that pattern's targets (which may themselves carry a '*').
// This is a simplified version of TypeScript's own algorithm (no
// longest-prefix-preference among multiple wildcard matches), sufficient
// for the common case of a handful of non-overlapping aliases.
function matchTsPaths(spec: string, config: TsPathsConfig): string[] {
  if (config.paths[spec]) return config.paths[spec].map(t => resolve(config.baseDir, t))
  for (const [pattern, targets] of Object.entries(config.paths)) {
    if (!pattern.includes('*')) continue
    const prefix = pattern.slice(0, pattern.indexOf('*'))
    const suffix = pattern.slice(pattern.indexOf('*') + 1)
    if (!spec.startsWith(prefix) || !spec.endsWith(suffix)) continue
    const captured = spec.slice(prefix.length, spec.length - suffix.length)
    return targets.map(t => resolve(config.baseDir, t.replace('*', captured)))
  }
  return []
}

// Resolves an import specifier to a real file on disk. Relative specifiers
// (./foo, ../foo) resolve against the importing file's own directory,
// trying the specifier literally first (an explicit, already-correct
// extension), then the NodeNext convention of stripping a trailing
// .js/.jsx before trying each real source extension (a compiled-output-
// style specifier pointing at its .ts source), then each extension
// appended directly, then the same two passes again under /index (a
// directory import). A non-relative (bare) specifier tries the same
// extension/index resolution against every tsPaths alias match, in
// order, before giving up as external (a real npm package, a Node
// builtin, or simply unaliased).
function resolveSpecifier(fromFile: string, spec: string, tsPaths: TsPathsConfig | null): string | null {
  if (spec.startsWith('.')) {
    return resolveCandidates(resolve(dirname(fromFile), spec))
  }
  if (tsPaths) {
    for (const base of matchTsPaths(spec, tsPaths)) {
      const found = resolveCandidates(base)
      if (found) return found
    }
  }
  return null
}

function relLabel(root: string, file: string): string {
  return relative(root, file).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '')
}

function nodeId(rel: string): string {
  return rel.replace(/[^A-Za-z0-9]/g, '_')
}

interface ImportGraphResult {
  nodes: string[]  // relative labels, sorted
  edges: Array<{ from: string; to: string }>  // relative labels, sorted
}

function buildImportGraph(root: string, tsPaths: TsPathsConfig | null): ImportGraphResult {
  const files = walkSourceFiles(root)
  const nodes = new Set<string>()
  const edgeKeys = new Set<string>()
  const edges: Array<{ from: string; to: string }> = []

  for (const file of files) {
    const rel = relLabel(root, file)
    nodes.add(rel)
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const spec of extractSpecifiers(text)) {
      const target = resolveSpecifier(file, spec, tsPaths)
      if (!target) continue
      const targetRel = relLabel(root, target)
      nodes.add(targetRel)
      if (targetRel === rel) continue
      const key = `${rel}\t${targetRel}`
      if (edgeKeys.has(key)) continue
      edgeKeys.add(key)
      edges.push({ from: rel, to: targetRel })
    }
  }

  return {
    nodes: [...nodes].sort(),
    edges: edges.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to)),
  }
}

function renderMermaid(result: ImportGraphResult): string {
  const lines = ['```mermaid', 'graph TD']
  for (const n of result.nodes) lines.push(`  ${nodeId(n)}["${n}"]`)
  for (const e of result.edges) lines.push(`  ${nodeId(e.from)} --> ${nodeId(e.to)}`)
  lines.push('```')
  return lines.join('\n')
}

const TSCONFIG_DISCOVERY_MAX_LEVELS = 4

// Auto-discovery: walk up from the resolved src= root looking for a
// tsconfig.json, stopping at the first one found. Quiet by design: an
// explicit tsconfig= (resolveExplicitTsConfig below) is a deliberate ask
// and a blocked/missing file there is worth a SECURITY_ALERT the same way
// any other blocked path is; auto-discovery is a best-effort convenience
// on top of the primary src= walk, and a project with no tsconfig.json,
// or one sitting outside what the jail happens to grant, should just get
// no alias resolution, not a warning about a file nobody asked for by
// name. Uses checkDataPath directly (not resolveDataPath) specifically to
// avoid its warning side effect.
function discoverTsConfig(root: string, ctx: EngineContext): TsPathsConfig | null {
  const jail = resolveDataJail(ctx)
  if (!jail) return null
  let dir = root
  for (let i = 0; i <= TSCONFIG_DISCOVERY_MAX_LEVELS; i++) {
    const candidate = join(dir, 'tsconfig.json')
    const check = checkDataPath(candidate, jail, ctx.security.allowedDataPaths, ctx.security.filesystemConfig)
    if (check.level !== 'blocked' && existsSync(candidate)) {
      const config = loadTsPathsConfig(candidate)
      if (config) return config
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

// Explicit tsconfig=: a deliberate ask, routed through the same
// resolveDataPath (warning-on-block included) every other explicit path
// argument in this codebase goes through, "point it at anything" still
// means anything the policy actually grants.
function resolveExplicitTsConfig(tsconfigArg: string, ctx: EngineContext): TsPathsConfig | null {
  const resolved = resolveDataPath(tsconfigArg, ctx, '@import-graph tsconfig=')
  if (!resolved) return null
  return loadTsPathsConfig(resolved)
}

export function executeImportGraph(node: ImportGraphNode, ctx: EngineContext): string {
  const root = resolveDataPath(node.src, ctx, '@import-graph')
  if (!root) return ''
  const tsPaths = node.tsconfig
    ? resolveExplicitTsConfig(node.tsconfig, ctx)
    : discoverTsConfig(root, ctx)
  const result = buildImportGraph(root, tsPaths)
  return renderMermaid(result)
}
