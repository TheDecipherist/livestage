#!/usr/bin/env node
// Independent ground truth for the unused-exports benchmark. Written
// without reference to unused-exports.js and sharing none of its
// resolution logic: that script uses ts-morph's language-service-backed
// findReferencesAsNodes() (a symbol-identity reference search); this one
// uses the raw `typescript` compiler API directly, no language service,
// and answers the question the other way around: build the set of every
// (file, name) pair actually imported anywhere in the program (a static
// import/export graph traversal, the same shape @import-graph's own
// resolver uses, conceptually, though this is a fresh implementation),
// then check each declared export against that set, rather than asking
// "who references this declaration" per symbol.
//
// Run directly: node benchmarks/unused-exports/ground-truth.js
// Not wired into a .stage document; this is the verification harness,
// not the benchmark subject.
const ts = require('typescript')
const path = require('node:path')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const SRC_DIR = path.join(REPO_ROOT, 'src') + path.sep
const TSCONFIG = path.join(REPO_ROOT, 'tsconfig.json')

function loadProgram() {
  const configFile = ts.readConfigFile(TSCONFIG, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, REPO_ROOT)
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
}

// Every top-level exported declaration a file makes of its OWN locals:
// export function/class/interface/type/enum X, export const X = ...,
// and a same-file `export { A, B as C }` (no `from`) naming a LOCALLY
// DECLARED identifier. Deliberately does not resolve `export * from`/
// `export {} from` here, those are handled separately below as edges in
// the re-export graph.
//
// `importedLocals` (a Set of local names) is every name this same file
// brought in via its own `import { ... } from` statements. A bare
// `export { a }` (no `from`) is TypeScript-legal for two different
// things: re-exporting a same-file declaration, or re-exporting a binding
// the file itself only imported, never declared, e.g.
// `import { X } from './y.js'; export { X }`, semantically the same as
// `export { X } from './y.js'`. Confirmed live: src/engine/engine.ts does
// exactly this for EngineContext (a type import) and FatalError (a value
// import) from context.ts/engine-include.ts respectively. Misattributing
// those to engine.ts as "own" declarations was a real bug here: nothing
// imports EngineContext/FatalError specifically FROM engine.ts (every
// real call site imports straight from the origin file), so the
// misattributed copy always read as unused and padded the count by
// exactly the number of such re-exports (2, here). Skipping a name found
// in importedLocals is correct, not a loss of coverage: the import graph
// traversal in main() already marks the ORIGIN file's export used via the
// normal `import` handling, and if some other file imports the name FROM
// engine.ts specifically, that is exactly the `export { a } from` shape
// main() already resolves as a re-export edge, which this function
// intentionally leaves for it to handle.
function ownExports(sourceFile, importedLocals) {
  const out = [] // { name, kind }
  for (const stmt of sourceFile.statements) {
    const isExported = stmt.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    if (isExported) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name) out.push({ name: stmt.name.text, kind: 'function' })
      else if (ts.isClassDeclaration(stmt) && stmt.name) out.push({ name: stmt.name.text, kind: 'class' })
      else if (ts.isInterfaceDeclaration(stmt)) out.push({ name: stmt.name.text, kind: 'type' })
      else if (ts.isTypeAliasDeclaration(stmt)) out.push({ name: stmt.name.text, kind: 'type' })
      else if (ts.isEnumDeclaration(stmt)) out.push({ name: stmt.name.text, kind: 'enum' })
      else if (ts.isVariableStatement(stmt)) {
        for (const decl of stmt.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) out.push({ name: decl.name.text, kind: 'const' })
        }
      }
    }
    // export { a, b as c } with no `from`: re-exports either a same-file
    // local declaration (a genuine own export) or a same-file import
    // binding (not an own export, see the importedLocals note above).
    if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const spec of stmt.exportClause.elements) {
        const localName = (spec.propertyName ?? spec.name).text
        if (importedLocals.has(localName)) continue
        out.push({ name: spec.name.text, kind: 'const' })
      }
    }
  }
  return out
}

// Resolves a module specifier from `fromFile` to an absolute source file
// path via TypeScript's own resolver (handles tsconfig baseUrl/paths,
// relative specifiers, and the NodeNext .js-in-source convention alike),
// falling back to null for a bare external package or an unresolvable one.
function resolveModule(specifier, fromFile, program) {
  const options = program.getCompilerOptions()
  const result = ts.resolveModuleName(specifier, fromFile, options, ts.sys)
  const resolved = result.resolvedModule?.resolvedFileName
  if (!resolved) return null
  return path.resolve(resolved)
}

function main() {
  const program = loadProgram()
  const allFiles = program.getSourceFiles().filter(f => !f.isDeclarationFile)
  const srcFiles = allFiles.filter(f => f.fileName.startsWith(SRC_DIR))

  // usedNames: resolvedFilePath -> Set of imported names ('*' means the
  // whole module/namespace was imported, treat every export as used).
  const usedNames = new Map()
  function markUsed(file, name) {
    if (!usedNames.has(file)) usedNames.set(file, new Set())
    usedNames.get(file).add(name)
  }

  // reExportEdges: resolvedFilePath -> [{ toFile, name|'*' }], the re-
  // export graph (export * from / export { a } from). Resolved into
  // usedNames in a second pass once we know which barrel files are
  // themselves imported.
  const reExportEdges = new Map()
  function addReExportEdge(fromBarrelFile, toFile, name) {
    if (!reExportEdges.has(fromBarrelFile)) reExportEdges.set(fromBarrelFile, [])
    reExportEdges.get(fromBarrelFile).push({ toFile, name })
  }

  // importedLocalsByFile: fileName -> Map(localBindingName -> { resolved,
  // real }), every name a file brought in via its own `import { ... }
  // from`. Used two ways below: ownExports() consults the plain name set
  // to avoid attributing a bare re-export of an import to this file as a
  // local declaration, and the bare `export { a }` handling further down
  // uses the resolved origin to add a proper re-export edge, so a file
  // that DOES import the name specifically from this barrel-ish file
  // still resolves correctly (the same shape as `export { a } from`,
  // just spelled as two statements instead of one).
  const importedLocalsByFile = new Map()

  for (const file of allFiles) {
    ts.forEachChild(file, function visit(node) {
      // import Decl from '...'; import { a, b as c } from '...'; import * as ns from '...';
      if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolved = resolveModule(node.moduleSpecifier.text, file.fileName, program)
        if (resolved && node.importClause) {
          if (node.importClause.name) markUsed(resolved, 'default')
          const bindings = node.importClause.namedBindings
          if (bindings && ts.isNamespaceImport(bindings)) markUsed(resolved, '*')
          if (bindings && ts.isNamedImports(bindings)) {
            for (const el of bindings.elements) {
              // `import { a as b }`: propertyName (if present) is the
              // real exported name; name is the local alias, irrelevant
              // to which export was used.
              const real = (el.propertyName ?? el.name).text
              markUsed(resolved, real)
              if (!importedLocalsByFile.has(file.fileName)) importedLocalsByFile.set(file.fileName, new Map())
              importedLocalsByFile.get(file.fileName).set(el.name.text, { resolved, real })
            }
          }
        }
      }
      // export { a, b as c } from '...';  export * from '...';
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolved = resolveModule(node.moduleSpecifier.text, file.fileName, program)
        if (resolved) {
          if (!node.exportClause) {
            addReExportEdge(file.fileName, resolved, '*')
          } else if (ts.isNamedExports(node.exportClause)) {
            for (const el of node.exportClause.elements) {
              const real = (el.propertyName ?? el.name).text
              addReExportEdge(file.fileName, resolved, real)
            }
          }
        }
      }
      // TypeScript's inline type-only form: import('./x').Y
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        const resolved = resolveModule(node.argument.literal.text, file.fileName, program)
        if (resolved) {
          if (node.qualifier && ts.isIdentifier(node.qualifier)) markUsed(resolved, node.qualifier.text)
          else markUsed(resolved, '*') // import('./x') with no qualifier: whole-module type usage
        }
      }
      ts.forEachChild(node, visit)
    })
  }

  // A bare `export { a }` (no `from`) whose name matches something this
  // same file imported is the two-statement spelling of `export { a }
  // from './origin.js'`: add the same re-export edge here that the
  // one-statement form gets above, so a caller importing the name
  // specifically from THIS file still resolves. Separate pass, after
  // importedLocalsByFile is fully built for every file, so statement
  // order within a file (import before or after the bare export) never
  // matters.
  for (const file of allFiles) {
    const imported = importedLocalsByFile.get(file.fileName)
    if (!imported) continue
    for (const stmt of file.statements) {
      if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
        for (const spec of stmt.exportClause.elements) {
          const localName = (spec.propertyName ?? spec.name).text
          const info = imported.get(localName)
          if (info) addReExportEdge(file.fileName, info.resolved, info.real)
        }
      }
    }
  }

  // Resolve the re-export graph: a barrel file B doing `export * from F`
  // or `export { name } from F` makes F's export "used" precisely when B
  // ITSELF is imported (by name, matching, or as '*'), directly or
  // transitively through further barrels. Breadth-first, depth-bounded
  // only by the graph's own size (no artificial cap).
  let changed = true
  while (changed) {
    changed = false
    for (const [barrelFile, edges] of reExportEdges) {
      const barrelUsedNames = usedNames.get(barrelFile)
      if (!barrelUsedNames) continue
      for (const { toFile, name } of edges) {
        const propagate = (n) => {
          if (!usedNames.has(toFile)) usedNames.set(toFile, new Set())
          if (!usedNames.get(toFile).has(n)) { usedNames.get(toFile).add(n); changed = true }
        }
        if (name === '*') {
          // export * from F: every name imported from the barrel is
          // really a name from F (best-effort: also propagate '*' itself,
          // covering "the barrel was namespace-imported").
          for (const n of barrelUsedNames) propagate(n)
        } else if (barrelUsedNames.has(name) || barrelUsedNames.has('*')) {
          propagate(name)
        }
      }
    }
  }

  const items = []
  for (const file of srcFiles) {
    const importedLocals = new Set(importedLocalsByFile.get(file.fileName)?.keys() ?? [])
    const exports = ownExports(file, importedLocals)
    const used = usedNames.get(file.fileName)
    for (const { name, kind } of exports) {
      const isUsed = used && (used.has(name) || used.has('*'))
      if (!isUsed) {
        items.push({ symbol: name, file: path.relative(REPO_ROOT, file.fileName), kind })
      }
    }
  }
  items.sort((a, b) => (a.file + a.symbol).localeCompare(b.file + b.symbol))
  process.stdout.write(JSON.stringify({ count: items.length, items }, null, 2) + '\n')
}

main()
