import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Drift Examples (feature 51): four worked examples under examples/drift/,
// each replacing a specific kind of hand-maintained doc/config that
// silently diverges from the code that should govern it: env vars, package
// scripts, test coverage, and TODO debt. Each ships with the exact minimal
// policy grant it needs (two need none at all, filesystem-only).
const repoRoot = join(import.meta.dirname, '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')

function render(cwd: string, file: string): string {
  return execFileSync('node', [cliEntry, 'render', file], { cwd, encoding: 'utf8' })
}

describe('env-drift: cross-references process.env usage in code against .env.example', () => {
  it('surfaces both the used-but-undocumented and documented-but-unused vars', () => {
    const cwd = join(repoRoot, 'examples', 'drift', 'env-drift')
    const out = render(cwd, 'env-drift.stage')
    expect(out).toContain('process.env.DATABASE_URL')
    expect(out).toContain('process.env.LOG_LEVEL')
    expect(out).toContain('process.env.STRIPE_SECRET_KEY')
    expect(out).toContain('DATABASE_URL=postgres://localhost:5432/app')
    expect(out).toContain('PORT=3000')
  })
})

describe('scripts-reference: renders package.json scripts as a live table', () => {
  it('needs no policy grant at all (filesystem-only)', () => {
    const cwd = join(repoRoot, 'examples', 'drift', 'scripts-reference')
    const out = render(cwd, 'scripts-reference.stage')
    expect(out).toContain('| dev')
    expect(out).toContain('vite')
    expect(out).toContain('vitest run')
  })
})

describe('test-coverage-map: lists source files and test files side by side', () => {
  it('needs no policy grant at all (filesystem-only)', () => {
    const cwd = join(repoRoot, 'examples', 'drift', 'test-coverage-map')
    const out = render(cwd, 'test-coverage-map.stage')
    expect(out).toContain('sample-project/src/add.ts')
    expect(out).toContain('sample-project/src/multiply.ts')
    expect(out).toContain('sample-project/tests/add.test.ts')
    // multiply.ts has no matching test file -- confirmed absent
    expect(out).not.toContain('multiply.test.ts')
  })
})

describe('todo-debt: live TODO/FIXME/HACK inventory with file:line', () => {
  it('surfaces all three markers from the fixture file', () => {
    const cwd = join(repoRoot, 'examples', 'drift', 'todo-debt')
    const out = render(cwd, 'todo-debt.stage')
    expect(out).toMatch(/payments\.ts:\d+:.*TODO/)
    expect(out).toMatch(/payments\.ts:\d+:.*FIXME/)
    expect(out).toMatch(/payments\.ts:\d+:.*HACK/)
  })
})

describe('every shell-backed drift example ships only exact-string allow_patterns, no wildcards', () => {
  it.each(['env-drift', 'todo-debt'])('%s: policy.json has no wildcard allow pattern', (dir) => {
    const policy = JSON.parse(readFileSync(join(repoRoot, 'examples', 'drift', dir, '.livestage', 'policy.json'), 'utf8'))
    expect(policy.shell.enabled).toBe(true)
    for (const pattern of policy.shell.allow_patterns as string[]) {
      expect(pattern).not.toContain('*')
    }
  })
})

// Bug B1 (feature 51 / feature 48, 2026-08-17): every example ships a
// committed .md rendering, checked by scripts/check-example-renders.mjs
// (mirrors scripts/check-readme.mjs exactly, wired into CI alongside it).
const checkExampleRendersScript = join(repoRoot, 'scripts', 'check-example-renders.mjs')

function runCheckExampleRenders(): void {
  execFileSync('node', [checkExampleRendersScript], { cwd: repoRoot, encoding: 'utf8' })
}

describe('every drift example ships a committed .md matching its live render', () => {
  it.each([
    'env-drift/env-drift.md',
    'scripts-reference/scripts-reference.md',
    'test-coverage-map/test-coverage-map.md',
    'todo-debt/todo-debt.md',
  ])('%s exists and is not empty', (relPath) => {
    const full = join(repoRoot, 'examples', 'drift', relPath)
    const content = readFileSync(full, 'utf8')
    expect(content.trim().length).toBeGreaterThan(0)
  })

  it('examples:check passes when every committed .md is current', () => {
    // Trusts the actual committed .md files (this feature's own build
    // generated them via `npm run examples:render`, and they are checked
    // into this branch) rather than regenerating them here, so this test
    // never writes to a tracked file.
    expect(runCheckExampleRenders).not.toThrow()
  })

  it('examples:check FAILS when a committed .md is stale (proves the check is not vacuous)', () => {
    const mdPath = join(repoRoot, 'examples', 'drift', 'env-drift', 'env-drift.md')
    const original = readFileSync(mdPath, 'utf8')
    try {
      writeFileSync(mdPath, 'deliberately stale content for this test\n')
      expect(runCheckExampleRenders).toThrow()
    } finally {
      writeFileSync(mdPath, original)
    }
  })

  it('examples:check FAILS when a committed .md is missing entirely', () => {
    const mdPath = join(repoRoot, 'examples', 'drift', 'todo-debt', 'todo-debt.md')
    const original = readFileSync(mdPath, 'utf8')
    try {
      rmSync(mdPath)
      expect(runCheckExampleRenders).toThrow()
    } finally {
      writeFileSync(mdPath, original)
    }
  })
})
