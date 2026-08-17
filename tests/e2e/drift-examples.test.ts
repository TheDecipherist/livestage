import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
