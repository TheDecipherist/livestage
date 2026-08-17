import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Import Graph example (feature 53): @graph reads YAML frontmatter, it has
// no notion of TypeScript import statements, so it cannot graph real source
// code (examples/connections/connections.stage's territory is markdown
// docs declaring their own relationships). Originally the @code-under-
// policy answer (a regex-based import walker script run under a
// code.languages grant); migrated to the native @import-graph directive
// once one existed, dropping the shell/@code grant entirely in favor of
// the same filesystem-read jail @list/@tree already use.
const repoRoot = join(import.meta.dirname, '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')
const exampleDir = join(repoRoot, 'examples', 'import-graph')

function realTsFileCount(dir: string): number {
  let count = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) count += realTsFileCount(full)
    else if (entry.isFile() && entry.name.endsWith('.ts')) count++
  }
  return count
}

function render(): string {
  return execFileSync('node', [cliEntry, 'render', 'import-graph.stage'], { cwd: exampleDir, encoding: 'utf8' })
}

describe('import-graph.stage graphs this project\'s real src/ tree via @import-graph, not @graph', () => {
  it('produces a fenced mermaid block, not an empty graph', () => {
    const out = render()
    expect(out).toContain('```mermaid')
    expect(out).toContain('graph TD')
    // The literal proof @graph cannot do this: an empty "graph TD" with no
    // nodes, which is exactly what @graph target="src/**/*.ts" produces
    // (src/ files have no YAML frontmatter for @graph to read). This
    // example's whole point is @import-graph actually has content.
    expect(out).not.toMatch(/```mermaid\s*graph TD\s*```/)
  })

  it('every real .ts file under src/ appears as exactly one graph node', () => {
    const out = render()
    const realCount = realTsFileCount(join(repoRoot, 'src'))
    const nodeLines = out.split('\n').filter(l => /^\s*\w+\["/.test(l))
    expect(nodeLines.length).toBe(realCount)
  })

  it('spot-checks a known, stable real edge: macros.ts imports from engine-include.ts', () => {
    // src/engine/macros.ts imports shellQuote from './engine-include.js'.
    // A stable, real edge, not a coincidence of file existence.
    const out = render()
    expect(out).toMatch(/engine_macros\s*-->\s*engine_engine_include/)
  })

  it('captures TypeScript\'s inline type-only import form, not just import-from statements', () => {
    // context.ts's dependency on determinism.ts exists ONLY via
    // {{ }} determinism: import('./determinism.js').DeterminismState, no
    // top-level import statement captures it anywhere else in that file.
    // @import-graph.ts ports this exact regex from the original @code
    // script, where the gap was originally found and fixed.
    const out = render()
    expect(out).toMatch(/engine_context\s*-->\s*engine_determinism/)
  })

  it('needs only a filesystem allow-path to src/, no shell or @code grant at all', () => {
    const raw = readFileSync(join(exampleDir, '.livestage', 'policy.json'), 'utf8')
    const policy = JSON.parse(raw) as { filesystem?: { allowed_data_paths?: string[] }; shell?: unknown; http?: unknown; code?: unknown }
    expect(policy.filesystem?.allowed_data_paths).toEqual(['**/src'])
    expect(policy.shell).toBeUndefined()
    expect(policy.http).toBeUndefined()
    expect(policy.code).toBeUndefined()
  })

  it('a project without the filesystem grant gets a blocked, empty result, not a silent full walk', () => {
    // Prove the jail is load-bearing, not just present: without the
    // allowed_data_paths entry, ../../src falls outside this doc's own
    // directory (the default data jail) and must be refused. Renders from
    // a throwaway COPY of the example, never the real tracked policy.json:
    // that file is also read by all-examples-rendered.test.ts, and vitest
    // runs test files in parallel, so mutating the real committed file in
    // place risks a second file catching it mid-mutation (the exact
    // gotcha this project's own CLAUDE.md documents for readme:check's and
    // examples:check's vacuousness proofs).
    const scratchDir = mkdtempSync(join(tmpdir(), 'ls-import-graph-example-'))
    try {
      // Absolute src= (not the real example's relative "../../src") so the
      // copy's own directory depth doesn't matter, still the real repo's
      // real src/ tree, still outside the copy's own directory, still
      // needs a grant.
      writeFileSync(join(scratchDir, 'import-graph.stage'), `@import-graph src="${join(repoRoot, 'src')}" /\n`)
      const out = execFileSync('node', [cliEntry, 'render', 'import-graph.stage'], { cwd: scratchDir, encoding: 'utf8' })
      // Matches @tree/@list: a blocked path contributes nothing at all
      // (plus a SECURITY_ALERT warning on stderr/--verbose), not an
      // empty-but-present graph.
      expect(out.trim()).toBe('')
    } finally {
      rmSync(scratchDir, { recursive: true, force: true })
    }
  })
})
