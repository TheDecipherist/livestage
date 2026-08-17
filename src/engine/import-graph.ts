import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import type { ImportGraphNode } from 'livestage/parser'
import type { EngineContext } from './context.js'
import { resolveDataPath } from './sources.js'

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
// lists alike (the brace list is skipped non-greedily up to `from`).
const FROM_CLAUSE = /(?:^|\n)\s*(?:import|export)(?:\s+type)?\s+(?:\{[\s\S]*?\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g
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

// Resolves a relative specifier against the importing file's directory to
// a real file on disk. Tries the specifier literally first (an explicit,
// already-correct extension), then the NodeNext convention of stripping a
// trailing .js/.jsx before trying each real source extension (a compiled-
// output-style specifier pointing at its .ts source), then each extension
// appended directly (an extensionless specifier), then the same two passes
// again under /index (a directory import). Returns null for a bare
// (non-relative) specifier or one that resolves to nothing on disk.
function resolveSpecifier(fromFile: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(fromFile), spec)
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

function buildImportGraph(root: string): ImportGraphResult {
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
      const target = resolveSpecifier(file, spec)
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

export function executeImportGraph(node: ImportGraphNode, ctx: EngineContext): string {
  const root = resolveDataPath(node.src, ctx, '@import-graph')
  if (!root) return ''
  const result = buildImportGraph(root)
  return renderMermaid(result)
}
