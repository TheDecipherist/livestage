import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runParseCheck } from '../../../src/cli/commands/parse.js'
import { runRendererPreview } from '../../../src/cli/commands/renderer-preview.js'
import { runRender } from '../../../src/cli/commands/render.js'
import { runEval } from '../../../src/cli/commands/eval.js'

// Post-initiative known_issues sweep (task 32): 13-cli-router.md flagged
// `parser check`, `engine eval` (namespaced), `renderer preview --format`,
// and `render --timeout` as never built. `engine eval` reuses runEval
// directly (already covered by tests/unit/cli/eval.test.ts, if present, or
// exercised live via the built binary); this file covers the three that
// needed new implementation.
describe('engine eval (13-cli-router): the namespaced verb is the same runEval the flat "eval" verb uses', () => {
  it('evaluates a plain arithmetic expression', () => {
    const result = runEval('1 + 2')
    expect(result.exitCode).toBe(0)
    expect(result.output).toBe('3')
  })

  it('reads an --env-loaded value through the same runEval the namespaced verb dispatches to', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-eval-env-'))
    try {
      const envFile = join(dir, '.env')
      writeFileSync(envFile, 'GREETING=hi\n')
      const result = runEval('env.GREETING', { env: envFile })
      expect(result.exitCode).toBe(0)
      expect(result.output).toBe('hi')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('parser check (13-cli-router)', () => {
  let dir: string

  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'ls-parser-check-')) })
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  function write(name: string, content: string): string {
    const p = join(dir, name)
    writeFileSync(p, content)
    return p
  }

  it('a grammatically valid document passes with exit 0', () => {
    const file = write('valid.stage', 'hello {{ 1 + 1 }}\n')
    const result = runParseCheck(file, { cwd: dir })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.exitCode).toBe(0)
  })

  it('a grammar error (unclosed block) fails with exit 1, not the macro/policy checks validate does', () => {
    const file = write('broken.stage', '@code language="javascript"\nconsole.log(1)\n')
    const result = runParseCheck(file, { cwd: dir })
    expect(result.valid).toBe(false)
    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('Unclosed block')
  })

  it('a missing file is a usage error, exit 2', () => {
    const result = runParseCheck('does-not-exist.stage', { cwd: dir })
    expect(result.valid).toBe(false)
    expect(result.exitCode).toBe(2)
  })
})

describe('renderer preview (13-cli-router)', () => {
  it('renders a table from tab-separated data via an explicit file path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-renderer-preview-'))
    try {
      const file = join(dir, 'rows.txt')
      writeFileSync(file, 'name\tage\nAlice\t30\n')
      const result = runRendererPreview('rows.txt', 'table', { cwd: dir })
      expect(result.exitCode).toBe(0)
      expect(result.output).toContain('| name')
      expect(result.output).toContain('Alice')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('an unknown format is a usage error (exit 2), not a renderer crash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-renderer-preview-'))
    try {
      const file = join(dir, 'rows.txt')
      writeFileSync(file, 'a\n')
      const result = runRendererPreview('rows.txt', 'bogus', { cwd: dir })
      expect(result.exitCode).toBe(2)
      expect(result.errors[0]).toContain('Unknown render type')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('--columns overrides the header row', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-renderer-preview-'))
    try {
      const file = join(dir, 'rows.txt')
      writeFileSync(file, 'Alice\t30\n')
      const result = runRendererPreview('rows.txt', 'table', { cwd: dir, columns: 'name,age' })
      expect(result.output).toContain('| name')
      expect(result.output).toContain('| age')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('render --timeout (13-cli-router)', () => {
  let dir: string

  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'ls-render-timeout-')) })
  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  function write(name: string, content: string): string {
    const p = join(dir, name)
    writeFileSync(p, content)
    return p
  }

  it('a generous timeout does not interfere with a normal render', () => {
    const file = write('ok.stage', 'hello world\n')
    const result = runRender(file, { timeout: 5000 })
    expect(result.exitCode).toBe(0)
    expect(result.output.trim()).toBe('hello world')
  })

  it('a deadline that expires mid-render stops the remaining top-level nodes (cooperative, checked once per node)', () => {
    // Deterministic rather than racy: node 1 (@query "sleep 0.05") always
    // takes ~50ms regardless of machine speed, so a 10ms deadline reliably
    // expires before node 2's walkNode call, not by chance timing on a
    // near-instant doc.
    const file = write('slow.stage', '@query "sleep 0.05" /\nafter the sleep\nshould never appear\n')
    const result = runRender(file, {
      timeout: 10,
      securityConfig: {
        allowShell: true, allowHttp: false, allowDb: false, jailRoot: dir,
        shellConfig: { enabled: true, allow_patterns: ['*'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false },
      },
    })
    expect(result.exitCode).toBe(1)
    expect(result.errors.some(e => e.includes('exceeded --timeout'))).toBe(true)
    expect(result.output).not.toContain('after the sleep')
    expect(result.output).not.toContain('should never appear')
  })

  it('without --timeout, no deadline is enforced (default behavior unchanged)', () => {
    const file = write('untimed.stage', 'hello\n')
    const result = runRender(file, {})
    expect(result.exitCode).toBe(0)
  })
})
