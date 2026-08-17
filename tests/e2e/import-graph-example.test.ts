import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Import Graph example (feature 53): @graph reads YAML frontmatter, it has
// no notion of TypeScript import statements, so it cannot graph real source
// code (examples/connections/connections.stage's territory is markdown
// docs declaring their own relationships). This example is the @code-
// under-policy answer: a real regex-based import walker over this
// project's own src/ tree, not a fixture, piped into
// @render type="code" lang="mermaid".
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

describe('import-graph.stage graphs this project\'s real src/ tree via @code, not @graph', () => {
  it('produces a fenced mermaid block, not an empty graph', () => {
    const out = render()
    expect(out).toContain('```mermaid')
    expect(out).toContain('graph TD')
    // The literal proof @graph cannot do this: an empty "graph TD" with no
    // nodes, which is exactly what @graph target="src/**/*.ts" produces
    // (confirmed live, src/ files have no YAML frontmatter for @graph to
    // read). This example's whole point is the @code alternative actually
    // has content.
    expect(out).not.toMatch(/```mermaid\s*graph TD\s*```/)
  })

  it('every real .ts file under src/ appears as exactly one graph node', () => {
    const out = render()
    const realCount = realTsFileCount(join(repoRoot, 'src'))
    const nodeLines = out.split('\n').filter(l => /^\s*\w+\["/.test(l))
    expect(nodeLines.length).toBe(realCount)
  })

  it('spot-checks a known, stable real edge: macros.ts imports from engine-include.ts', () => {
    // src/engine/macros.ts imports shellQuote from './engine-include.js'
    // (added this session, feature 20/17's table-compact/join= fixes).
    // A stable, real edge, not a coincidence of file existence.
    const out = render()
    expect(out).toMatch(/engine_macros\s*-->\s*engine_engine_include/)
  })

  it('captures TypeScript\'s inline type-only import form, not just import-from statements', () => {
    // Found live, asked directly "is this actually complete?": a first
    // draft's regex only matched `import {...} from '...'` / bare
    // `import '...'`, missing TypeScript's `import('./x.js').Type` inline
    // form entirely. context.ts's dependency on determinism.ts (`{{ }}`
    // determinism: import('./determinism.js').DeterminismState) exists
    // ONLY this way, no top-level import captures it anywhere else in
    // that file, confirmed by grep before fixing.
    const out = render()
    expect(out).toMatch(/engine_context\s*-->\s*engine_determinism/)
  })

  it('needs only code.languages=[javascript], the exact minimal grant', () => {
    const raw = readFileSync(join(exampleDir, '.livestage', 'policy.json'), 'utf8')
    const policy = JSON.parse(raw) as { code?: { languages?: string[] }; shell?: unknown; http?: unknown }
    expect(policy.code?.languages).toEqual(['javascript'])
    expect(policy.shell).toBeUndefined()
    expect(policy.http).toBeUndefined()
  })
})
