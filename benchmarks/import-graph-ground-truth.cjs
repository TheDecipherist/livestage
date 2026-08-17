#!/usr/bin/env node
// Independent ground truth for the import-graph benchmark (class 3, item
// 2). @import-graph.ts (src/engine/import-graph.ts) resolves specifiers
// with hand-rolled regexes (FROM_CLAUSE, BARE_IMPORT, INLINE_TYPE_IMPORT)
// plus its own candidate-extension/index file-probing resolver and a
// simplified tsPaths matcher. This script shares none of that: it uses
// the raw `typescript` compiler API's own AST walk and its own
// `ts.resolveModuleName` for every specifier, the same shape of approach
// ground-truth.cjs (the unused-exports benchmark's ground truth) takes
// for a different question, a fresh implementation for this one.
//
// Edge definition matched to @import-graph's own output shape (verified
// by reading its buildImportGraph): one edge per unique (fromFile,
// toFile) pair where fromFile references toFile via ANY import form,
// self-edges excluded, both endpoints restricted to files under src/.
//
// Run directly: node benchmarks/import-graph-ground-truth.cjs
// Not wired into a .stage document; this is the verification harness.
const ts = require('typescript')
const path = require('node:path')

const REPO_ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(REPO_ROOT, 'src') + path.sep
const TSCONFIG = path.join(REPO_ROOT, 'tsconfig.json')

function loadProgram() {
  const configFile = ts.readConfigFile(TSCONFIG, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, REPO_ROOT)
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options })
}

function resolveModule(specifier, fromFile, program) {
  const options = program.getCompilerOptions()
  const result = ts.resolveModuleName(specifier, fromFile, options, ts.sys)
  const resolved = result.resolvedModule?.resolvedFileName
  if (!resolved) return null
  return path.resolve(resolved)
}

// relLabel matches @import-graph's own relLabel: path relative to the
// walked root (src/ here), extension stripped, so the two edge sets
// compare on identical labels without a translation step.
function relLabel(file) {
  return path.relative(path.join(REPO_ROOT, 'src'), file).replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '')
}

function main() {
  const program = loadProgram()
  const allFiles = program.getSourceFiles().filter(f => !f.isDeclarationFile)
  const srcFiles = allFiles.filter(f => f.fileName.startsWith(SRC_DIR))

  const edgeKeys = new Set()
  const edges = []
  function addEdge(fromFile, toFile) {
    if (!toFile.startsWith(SRC_DIR)) return // only edges landing back inside src/, matching @import-graph's own root walk
    const from = relLabel(fromFile)
    const to = relLabel(toFile)
    if (from === to) return // self-edge, @import-graph explicitly skips these too
    const key = from + '\t' + to
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ from, to })
  }

  for (const file of srcFiles) {
    ts.forEachChild(file, function visit(node) {
      // import Decl from '...'; import { a } from '...'; import * as ns from '...'; bare import '...';
      if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolved = resolveModule(node.moduleSpecifier.text, file.fileName, program)
        if (resolved) addEdge(file.fileName, resolved)
      }
      // export { a } from '...'; export * from '...';
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        const resolved = resolveModule(node.moduleSpecifier.text, file.fileName, program)
        if (resolved) addEdge(file.fileName, resolved)
      }
      // TypeScript's inline type-only form: import('./x.js').Y (also
      // covers a qualifier-less import('./x') whole-module type use).
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
        const resolved = resolveModule(node.argument.literal.text, file.fileName, program)
        if (resolved) addEdge(file.fileName, resolved)
      }
      ts.forEachChild(node, visit)
    })
  }

  edges.sort((a, b) => (a.from + a.to).localeCompare(b.from + b.to))
  const nodes = [...new Set(srcFiles.map(f => relLabel(f.fileName)))].sort()
  process.stdout.write(JSON.stringify({ nodeCount: nodes.length, edgeCount: edges.length, edges }, null, 2) + '\n')
}

main()
