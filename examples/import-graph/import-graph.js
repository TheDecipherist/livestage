// Walks the real src/ tree (two levels up from this example's own
// directory, examples/import-graph/) and extracts every import/export
// ... from '...' statement via regex, no TypeScript compiler dependency,
// matching this project's own "no runtime dependencies beyond commander"
// rule (see package.json). Not a full parser: string literals or comments
// that happen to contain the literal text `from "..."` in import position
// would false-match, a real but narrow risk, acceptable for a worked
// example over this project's own, already-known source.
//
// Resolves relative imports (./foo.js, ../bar.js) to the real file on
// disk, accounting for this codebase's NodeNext convention (an import
// path ending in .js refers to the compiled output of a .ts source file
// of the same name). Resolves the three `livestage/*` path-alias imports
// (tsconfig.json's "paths") to their real target files. Drops anything
// that isn't a same-repo source file: node: builtins, npm packages,
// type-only re-exports that resolve outside src/.
//
// Emits Mermaid graph TD syntax directly to stdout; the .stage document
// only ever pipes this output into @render, it never re-derives the graph
// itself.
const fs = require('node:fs')
const path = require('node:path')

// @code copies the script to an isolated tmpdir before running it (see
// code-runners.ts), so __dirname points there, not at this file's real
// location. The spawned process's cwd is ctx.docDir instead, the .stage
// file's own directory, which is what a relative path here should mean.
const SRC_ROOT = path.resolve(process.cwd(), '..', '..', 'src')

const ALIAS_TARGETS = {
  'livestage/parser': 'parser/index.ts',
  'livestage/engine': 'engine/index.ts',
  'livestage/renderer': 'renderer/index.ts',
}

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.isFile() && entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

// Every import/export ... from '...' clause, single- or multi-line brace
// lists alike (the brace list is skipped non-greedily up to the `from`).
const FROM_CLAUSE = /(?:^|\n)\s*(?:import|export)(?:\s+type)?\s+(?:\{[\s\S]*?\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]([^'"]+)['"]/g
// Side-effect-only imports: import '...' (no `from`).
const BARE_IMPORT = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g
// TypeScript's inline type-only form, `import('./x.js').SomeType`, used to
// reference a type without a top-level import statement. Found live: a
// first draft missed this entirely, understating one real edge
// (engine/context.ts's dependency on engine/determinism.ts existed ONLY
// this way, no top-level import captured it anywhere in that file).
const INLINE_TYPE_IMPORT = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g

function extractImportSpecifiers(text) {
  const specs = []
  for (const m of text.matchAll(FROM_CLAUSE)) specs.push(m[1])
  for (const m of text.matchAll(BARE_IMPORT)) specs.push(m[1])
  for (const m of text.matchAll(INLINE_TYPE_IMPORT)) specs.push(m[1])
  return specs
}

function resolveSpecifier(fromFile, spec) {
  if (ALIAS_TARGETS[spec]) return path.join(SRC_ROOT, ALIAS_TARGETS[spec])
  if (!spec.startsWith('.')) return null // node: builtin or npm package, not a src/ file
  const resolved = path.resolve(path.dirname(fromFile), spec)
  // NodeNext convention: the import path ends in .js, the real source is .ts.
  const tsPath = resolved.endsWith('.js') ? resolved.slice(0, -3) + '.ts' : resolved + '.ts'
  return fs.existsSync(tsPath) ? tsPath : null
}

function relLabel(file) {
  return path.relative(SRC_ROOT, file).replace(/\.ts$/, '')
}

function nodeId(rel) {
  return rel.replace(/[^A-Za-z0-9]/g, '_')
}

const files = walk(SRC_ROOT)
const edges = new Set()
const nodes = new Set()

for (const file of files) {
  const rel = relLabel(file)
  nodes.add(rel)
  const text = fs.readFileSync(file, 'utf8')
  for (const spec of extractImportSpecifiers(text)) {
    const target = resolveSpecifier(file, spec)
    if (!target) continue
    const targetRel = relLabel(target)
    nodes.add(targetRel)
    if (targetRel !== rel) edges.add(`${rel}\t${targetRel}`)
  }
}

const lines = ['graph TD']
for (const n of [...nodes].sort()) lines.push(`  ${nodeId(n)}["${n}"]`)
for (const e of [...edges].sort()) {
  const [from, to] = e.split('\t')
  lines.push(`  ${nodeId(from)} --> ${nodeId(to)}`)
}
console.log(lines.join('\n'))
