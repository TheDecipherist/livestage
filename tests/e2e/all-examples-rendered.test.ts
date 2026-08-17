import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Bug B1 (feature 48, cross-cutting: 40-pattern-example, 44-examples-showcase,
// 46-connections-example, 47-reach-via-code, 51-drift-examples), 2026-08-17.
// Every example under examples/ now ships a committed .md rendering next to
// its .stage source, enforced by scripts/check-example-renders.mjs
// (npm run examples:check, wired into CI). This is the cross-cutting proof
// that the full target list (all owning docs' examples together) is
// present, correct, and that the check script itself passes end to end;
// each feature's own test file additionally covers its own slice.
//
// The relative paths below are intentionally hardcoded rather than
// imported from scripts/example-render-targets.mjs: no other test in this
// suite imports a .mjs script module into a .ts test (they invoke scripts
// as child processes via execFileSync instead), and a plain-.mjs import
// has no type declarations, which fails the project's own bare `tsc
// --noEmit` (whole-project typecheck, distinct from the src-only build).
const repoRoot = join(import.meta.dirname, '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')

const ALL_EXAMPLE_MD_FILES = [
  'examples/drift/env-drift/env-drift.md',
  'examples/drift/env-drift/env-drift-terse.md',
  'examples/drift/scripts-reference/scripts-reference.md',
  'examples/drift/scripts-reference/scripts-reference-terse.md',
  'examples/drift/test-coverage-map/test-coverage-map.md',
  'examples/drift/test-coverage-map/test-coverage-map-terse.md',
  'examples/drift/test-coverage-map/test-coverage-map-side-by-side.md',
  'examples/drift/todo-debt/todo-debt.md',
  'examples/drift/todo-debt/todo-debt-terse.md',
  'examples/agent-briefs/onboarding-brief.md',
  'examples/agent-briefs/codebase-health.md',
  'examples/agent-briefs/change-review.md',
  'examples/database/customers.md',
  'examples/http-health/check.md',
  'examples/connections/connections.md',
  'examples/multi-step/index.md',
  'examples/showcase/index.md',
  'examples/showcase/api-reference.md',
  'examples/showcase/report.md',
  'examples/hello.md',
  'examples/import-graph/import-graph.md',
]

describe('every example has a non-empty committed .md', () => {
  it.each(ALL_EXAMPLE_MD_FILES)('%s exists and is not empty', (relPath: string) => {
    const full = join(repoRoot, relPath)
    expect(existsSync(full), `${relPath} does not exist`).toBe(true)
    expect(readFileSync(full, 'utf8').trim().length).toBeGreaterThan(0)
  })
})

// No "examples:check passes end-to-end" test here: tests/e2e/drift-examples.test.ts
// already asserts this (check-example-renders.mjs always validates the FULL
// target list, not just drift's own 4), and that file's OWN staleness-proof
// tests deliberately, temporarily corrupt real committed .md files. A second
// full-check assertion running concurrently in a different test FILE (vitest
// runs files in parallel by default) can observe that mutation mid-flight
// and fail for a reason that has nothing to do with this fix -- caught live
// during this build (a genuine flake, not a false alarm: re-running in
// isolation always passed). Removed as pure duplication rather than
// "fixed" with a lock, since the coverage already exists elsewhere.

describe('multi-step/index.stage: backtick-wrapped interpolation regression (B2)', () => {
  it('run_id resolves to a real value, not literal {{ }} syntax', () => {
    const out = execFileSync('node', [cliEntry, 'render', 'index.stage'], {
      cwd: join(repoRoot, 'examples', 'multi-step'),
      encoding: 'utf8',
    })
    expect(out).not.toContain('{{ state.run_id }}')
    expect(out).toMatch(/run none/)
  })
})

describe('README.stage\'s "More examples" section links only to files that exist', () => {
  it('every examples/... link target resolves on disk', () => {
    // Renders README.stage fresh rather than reading the committed
    // README.md: tests/e2e/readme-generation.test.ts's own staleness-proof
    // test deliberately, temporarily overwrites the real README.md with
    // placeholder content, and vitest runs test FILES in parallel by
    // default, so reading the committed file here can race that mutation
    // window (caught live during this build). Rendering fresh sidesteps
    // the shared file entirely.
    const readme = execFileSync('node', [cliEntry, 'render', 'README.stage'], { cwd: repoRoot, encoding: 'utf8' })
    const links = [...readme.matchAll(/\(examples\/[^)]+\)/g)].map(m => m[0].slice(1, -1))
    expect(links.length).toBeGreaterThan(10)
    const missing = links.filter(rel => !existsSync(join(repoRoot, rel)))
    expect(missing).toEqual([])
  })
})
