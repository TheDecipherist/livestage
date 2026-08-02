import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runEngineTrace } from '../../../src/cli/commands/engine-trace.js'

describe('runEngineTrace', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'engine-trace-cli-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function writeTraceFile(date: string, records: Record<string, unknown>[]): void {
    const traceDir = join(dir, '.livestage', 'trace')
    mkdirSync(traceDir, { recursive: true })
    writeFileSync(join(traceDir, `${date}.jsonl`), records.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  }

  it('errors when no trace directory exists', () => {
    const result = runEngineTrace({ cwd: dir })
    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('No trace records')
  })

  it('--last returns only the most recent render\'s records', () => {
    writeTraceFile('2026-01-01', [
      { t: 'directive', runId: 'run-a', directive: 'env' },
      { t: 'render', render_id: 'run-a', doc: '/a.stage', ms: 5, directives: 1, degraded: false, exit: 0 },
      { t: 'directive', runId: 'run-b', directive: 'query' },
      { t: 'render', render_id: 'run-b', doc: '/b.stage', ms: 8, directives: 1, degraded: false, exit: 0 },
    ])
    const result = runEngineTrace({ cwd: dir, last: true })
    expect(result.exitCode).toBe(0)
    expect(result.records).toHaveLength(2)
    expect(result.records.every(r => (r.t === 'render' ? r.render_id : r.runId) === 'run-b')).toBe(true)
  })

  it('a specific render-id returns only that render\'s records', () => {
    writeTraceFile('2026-01-01', [
      { t: 'directive', runId: 'run-a', directive: 'env' },
      { t: 'render', render_id: 'run-a', doc: '/a.stage', ms: 5, directives: 1, degraded: false, exit: 0 },
      { t: 'directive', runId: 'run-b', directive: 'query' },
      { t: 'render', render_id: 'run-b', doc: '/b.stage', ms: 8, directives: 1, degraded: false, exit: 0 },
    ])
    const result = runEngineTrace({ cwd: dir, renderId: 'run-a' })
    expect(result.exitCode).toBe(0)
    expect(result.records).toHaveLength(2)
    expect(result.records.every(r => (r.t === 'render' ? r.render_id : r.runId) === 'run-a')).toBe(true)
  })

  it('errors for an unknown render-id', () => {
    writeTraceFile('2026-01-01', [
      { t: 'render', render_id: 'run-a', doc: '/a.stage', ms: 5, directives: 1, degraded: false, exit: 0 },
    ])
    const result = runEngineTrace({ cwd: dir, renderId: 'does-not-exist' })
    expect(result.exitCode).toBe(1)
    expect(result.errors[0]).toContain('does-not-exist')
  })

  it('reads across multiple daily trace files for --last', () => {
    writeTraceFile('2026-01-01', [
      { t: 'render', render_id: 'run-old', doc: '/a.stage', ms: 5, directives: 1, degraded: false, exit: 0 },
    ])
    writeTraceFile('2026-01-02', [
      { t: 'render', render_id: 'run-new', doc: '/b.stage', ms: 5, directives: 1, degraded: false, exit: 0 },
    ])
    const result = runEngineTrace({ cwd: dir, last: true })
    expect(result.exitCode).toBe(0)
    expect(result.records).toHaveLength(1)
    expect((result.records[0] as { render_id: string }).render_id).toBe('run-new')
  })
})
