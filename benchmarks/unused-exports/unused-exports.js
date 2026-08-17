// Class 3 (construction) benchmark subject: which exported symbols under
// src/ are never imported anywhere in this repo. Uses ts-morph (a
// TypeScript compiler API wrapper), not regex, because that is the whole
// point of the comparison: a real resolver, authored once, that stays
// correct as the codebase changes, versus what an agent reaching for grep
// (or writing its own regex from scratch every session) actually gets
// right. ts-morph is a devDependency of the PROJECT, not of this script;
// @code can pull in any npm package the project already has, which is
// part of the argument this benchmark exists to make.
//
// @code copies this script out to an isolated tmpdir before running it
// (see src/engine/code-runners.ts), so a plain `require('ts-morph')`
// fails there, no node_modules exists in that tmpdir. The spawned
// process's own cwd stays at the .stage document's directory though
// (ctx.docDir), which IS inside the real repo, so resolving relative to
// cwd instead of the script's own location finds the real installation.
const path = require.resolve('ts-morph', { paths: [process.cwd()] })
const { Project, Node } = require(path)
const nodePath = require('node:path')

// This script's own doc directory is benchmarks/unused-exports/, two
// levels below the repo root, same assumption examples/import-graph/
// makes about its own depth.
const REPO_ROOT = nodePath.resolve(process.cwd(), '..', '..')
const SRC_DIR = nodePath.join(REPO_ROOT, 'src') + nodePath.sep

function classifyKind(decl) {
  const kind = decl.getKindName()
  if (kind === 'FunctionDeclaration') return 'function'
  if (kind === 'ClassDeclaration') return 'class'
  if (kind === 'InterfaceDeclaration' || kind === 'TypeAliasDeclaration') return 'type'
  if (kind === 'EnumDeclaration') return 'enum'
  return 'const'
}

function declKey(decl) {
  return decl.getSourceFile().getFilePath() + ':' + decl.getStart()
}

// findReferencesAsNodes() treats a barrel's re-export statement itself
// (export { X } from './y', export { X as Z } from './y') as a
// "reference" to X, even when nothing actually imports X through that
// barrel. Confirmed live: src/cli/commands/build.ts's BuildOptions is
// re-exported by src/cli/index.ts, a barrel nothing in this repo ever
// imports, yet a naive findReferencesAsNodes() reads that re-export line
// as "used elsewhere" and never flags it, a false negative (misses
// genuinely dead code) an independent ground-truth pass (a static
// import/export graph traversal, not reference search) caught: 37
// symbols this naive version missed, all through the same shape of gap.
// Fix: a cross-file reference only counts as real usage when its parent
// is NOT an ExportSpecifier; when it IS one, recurse onto that
// specifier's own name node and ask whether THAT is genuinely used
// (handles multi-level barrels; `visited` guards the (rare, but
// possible) circular re-export case).
// excludeFiles accumulates every file already accounted for along the
// current chain (the original declaring file, plus every barrel visited
// so far): recursing into a barrel's own specifier finds a reference
// pointing straight back at the ORIGINAL declaration, trivially "a
// different file" from the barrel's own, but not genuine usage, just the
// reverse direction of the same re-export edge. Excluding the whole
// chain, not just the immediate barrel file, is what makes that not
// register as a false "used".
function isGenuinelyUsedElsewhere(decl, visited, excludeFiles) {
  const key = declKey(decl)
  if (visited.has(key)) return false
  visited.add(key)
  let refs
  try {
    refs = decl.findReferencesAsNodes()
  } catch {
    return false // language service couldn't resolve references; don't guess either way
  }
  for (const ref of refs) {
    const refFile = ref.getSourceFile().getFilePath()
    if (excludeFiles.has(refFile)) continue
    const parent = ref.getParent()
    if (parent && Node.isExportSpecifier(parent)) {
      const nextExclude = new Set(excludeFiles)
      nextExclude.add(refFile)
      if (isGenuinelyUsedElsewhere(parent.getNameNode(), visited, nextExclude)) return true
      continue
    }
    return true // a real cross-file reference: an import, a call, a type position, etc.
  }
  return false
}

function main() {
  const project = new Project({ tsConfigFilePath: nodePath.join(REPO_ROOT, 'tsconfig.json') })
  const sourceFiles = project.getSourceFiles().filter(f => f.getFilePath().startsWith(SRC_DIR))

  // Reverse index: which files' own getExportedDeclarations() surfaces a
  // given declaration. A declaration appearing under more than one file
  // means at least one OTHER file (a barrel: export * from './x', or a
  // named re-export) exposes it too, not just its own declaring file.
  const exposedFrom = new Map()
  for (const file of sourceFiles) {
    for (const [, decls] of file.getExportedDeclarations()) {
      for (const decl of decls) {
        const key = declKey(decl)
        if (!exposedFrom.has(key)) exposedFrom.set(key, new Set())
        exposedFrom.get(key).add(file.getFilePath())
      }
    }
  }

  const items = []
  for (const file of sourceFiles) {
    const exported = file.getExportedDeclarations()
    for (const [name, decls] of exported) {
      for (const decl of decls) {
        // Only consider a declaration from the file that actually
        // declares it; a barrel's own getExportedDeclarations() also
        // surfaces everything it re-exports, which would otherwise
        // double-count the same underlying symbol once per barrel.
        if (decl.getSourceFile().getFilePath() !== file.getFilePath()) continue
        if (isGenuinelyUsedElsewhere(decl, new Set(), new Set([decl.getSourceFile().getFilePath()]))) continue

        const reExportedThroughBarrel = (exposedFrom.get(declKey(decl))?.size ?? 1) > 1
        items.push({
          symbol: name,
          file: nodePath.relative(REPO_ROOT, file.getFilePath()),
          kind: classifyKind(decl),
          reExportedThroughBarrel,
        })
      }
    }
  }

  items.sort((a, b) => (a.file + a.symbol).localeCompare(b.file + b.symbol))

  // Structured data only, no pre-formatted markdown. @foreach used to bind
  // its iteration variable via String(item), losing all structure the
  // moment a .stage document tried to iterate an array of objects
  // directly (src/engine/iter-ops.ts's splitItems did `parsed.map(v =>
  // String(v))`); @render source= had no lookup-by-label mechanism at
  // all. Both are now real (class 3 composition work): unused-exports.stage
  // presents this exact array via `@render source="dead.items"
  // type="table"`, with zero pre-formatting done here.
  process.stdout.write(JSON.stringify({ count: items.length, items }))
}

main()
