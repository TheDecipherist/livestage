import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

// CR-7 (Suite Baseline, feature 25): scripts/check-test-baseline.mjs is a
// standalone Node script, not a module under src/, so it has no unit
// coverage from importing it directly. Spawns the real script against a
// disposable copy of the repo shape it expects (scripts/check-test-baseline.mjs
// plus scripts/test-baseline.json plus .vitest-results.json at the root) so
// the pass, regression, and --update paths are exercised against the actual
// file, not a reimplementation of its logic.
describe('check-test-baseline.mjs', () => {
  let root: string
  let scriptPath: string
  let baselinePath: string
  let resultsPath: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ls-baseline-'))
    mkdirSync(join(root, 'scripts'), { recursive: true })
    scriptPath = join(root, 'scripts', 'check-test-baseline.mjs')
    copyFileSync(join(import.meta.dirname, '..', '..', '..', 'scripts', 'check-test-baseline.mjs'), scriptPath)
    baselinePath = join(root, 'scripts', 'test-baseline.json')
    resultsPath = join(root, '.vitest-results.json')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function run(args: string[] = []): { status: number | null; stdout: string; stderr: string } {
    const result = spawnSync('node', [scriptPath, ...args], { encoding: 'utf8' })
    return { status: result.status, stdout: result.stdout, stderr: result.stderr }
  }

  it('passes when the current count meets the baseline', () => {
    writeFileSync(baselinePath, JSON.stringify({ baseline: 100, recordedAt: '2026-08-01' }), 'utf8')
    writeFileSync(resultsPath, JSON.stringify({ numTotalTests: 100 }), 'utf8')
    const { status, stdout } = run()
    expect(status).toBe(0)
    expect(stdout).toContain('OK. 100 >= baseline 100')
  })

  it('fails with exit 1 when the current count drops below the baseline', () => {
    writeFileSync(baselinePath, JSON.stringify({ baseline: 100, recordedAt: '2026-08-01' }), 'utf8')
    writeFileSync(resultsPath, JSON.stringify({ numTotalTests: 42 }), 'utf8')
    const { status, stderr } = run()
    expect(status).toBe(1)
    expect(stderr).toContain('FAIL')
    expect(stderr).toContain('42')
    expect(stderr).toContain('100')
  })

  it('does not raise the baseline on a plain check, even when the count is higher', () => {
    writeFileSync(baselinePath, JSON.stringify({ baseline: 100, recordedAt: '2026-08-01' }), 'utf8')
    writeFileSync(resultsPath, JSON.stringify({ numTotalTests: 150 }), 'utf8')
    run()
    const baselineDoc = JSON.parse(readFileSync(baselinePath, 'utf8')) as { baseline: number }
    expect(baselineDoc.baseline).toBe(100)
  })

  it('raises the baseline with --update when the count increased', () => {
    writeFileSync(baselinePath, JSON.stringify({ baseline: 100, recordedAt: '2026-08-01' }), 'utf8')
    writeFileSync(resultsPath, JSON.stringify({ numTotalTests: 150 }), 'utf8')
    const { status, stdout } = run(['--update'])
    expect(status).toBe(0)
    expect(stdout).toContain('baseline raised 100 -> 150')
    const baselineDoc = JSON.parse(readFileSync(baselinePath, 'utf8')) as { baseline: number }
    expect(baselineDoc.baseline).toBe(150)
  })

  it('--update never lowers the baseline: a drop still fails', () => {
    writeFileSync(baselinePath, JSON.stringify({ baseline: 100, recordedAt: '2026-08-01' }), 'utf8')
    writeFileSync(resultsPath, JSON.stringify({ numTotalTests: 42 }), 'utf8')
    const { status, stderr } = run(['--update'])
    expect(status).toBe(1)
    expect(stderr).toContain('FAIL')
    const baselineDoc = JSON.parse(readFileSync(baselinePath, 'utf8')) as { baseline: number }
    expect(baselineDoc.baseline).toBe(100)
  })

  it('exits 2 with a clear message when .vitest-results.json is missing', () => {
    writeFileSync(baselinePath, JSON.stringify({ baseline: 100, recordedAt: '2026-08-01' }), 'utf8')
    expect(existsSync(resultsPath)).toBe(false)
    const { status, stderr } = run()
    expect(status).toBe(2)
    expect(stderr).toContain('not found')
  })

  it('exits 2 when numTotalTests is missing from the results file', () => {
    writeFileSync(baselinePath, JSON.stringify({ baseline: 100, recordedAt: '2026-08-01' }), 'utf8')
    writeFileSync(resultsPath, JSON.stringify({ someOtherField: true }), 'utf8')
    const { status, stderr } = run()
    expect(status).toBe(2)
    expect(stderr).toContain('numTotalTests')
  })
})
