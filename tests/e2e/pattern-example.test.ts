import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderViaCli } from '../../src/hook/pretooluse.js'

// F-PATTERN (feature 40): the worked multi-step example proves multi-step
// agent work is a shipped pattern (files as steps, frontmatter as state,
// assertions as gates), not workflow-engine machinery. Runs against a
// working copy of the real examples/multi-step/ directory (never the
// checked-in copy itself, so this test never leaves state.stage dirty for
// the next run or a real user).
const repoRoot = join(import.meta.dirname, '..', '..')
const exampleSrc = join(repoRoot, 'examples', 'multi-step')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')
let workDir: string

function resetState(dir: string): void {
  writeFileSync(join(dir, 'state.stage'),
    '---\nclass: pipeline-state\nrun_id: none\nstep: "0"\nupdated_at: none\n---\n\n# Pipeline State\n')
}

function step(file: string, runId: string): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('node', [cliEntry, 'render', file, '--var', `run_id=${runId}`], { cwd: workDir, encoding: 'utf8' })
    return { stdout, status: 0 }
  } catch (err) {
    const e = err as { stdout?: string; status?: number }
    return { stdout: e.stdout ?? '', status: e.status ?? 1 }
  }
}

function assertStep(file: string, runId: string): number {
  try {
    execFileSync('node', [cliEntry, 'assert', file, '--var', `run_id=${runId}`], { cwd: workDir, encoding: 'utf8' })
    return 0
  } catch (err) {
    return (err as { status?: number }).status ?? 1
  }
}

function stateField(field: string): string {
  const content = readFileSync(join(workDir, 'state.stage'), 'utf8')
  const m = content.match(new RegExp(`^${field}:\\s*(.*)$`, 'm'))
  return (m?.[1] ?? '').trim()
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'ls-pattern-'))
  cpSync(exampleSrc, workDir, { recursive: true })
  resetState(workDir)
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

describe('F-PATTERN: happy path', () => {
  it('running 01, 02, 03 in order renders green end to end', () => {
    const r1 = step('01-collect.stage', 'demo-1')
    const r2 = step('02-analyze.stage', 'demo-1')
    const r3 = step('03-report.stage', 'demo-1')
    expect(r1.status).toBe(0)
    expect(r2.status).toBe(0)
    expect(r3.status).toBe(0)
    expect(r2.stdout).not.toContain('BLOCKED')
    expect(r3.stdout).not.toContain('BLOCKED')
    expect(r3.stdout).toContain('finished successfully')
    expect(stateField('step')).toBe('3')
    expect(assertStep('03-report.stage', 'demo-1')).toBe(1) // step is now 3, not 2: 03's own gate no longer matches after it already ran once
  })
})

describe('F-PATTERN: skipped-step renders red', () => {
  it('running 02 before 01 blocks instead of silently analyzing nothing', () => {
    const r2 = step('02-analyze.stage', 'demo-1')
    expect(r2.stdout).toContain('BLOCKED (skipped-step)')
    expect(assertStep('02-analyze.stage', 'demo-1')).toBe(1)
    expect(stateField('step')).toBe('"0"') // never corrupted by the blocked step
  })
})

describe('F-PATTERN: stale-state is detected and reported', () => {
  it('a state file from a different run is refused, not silently trusted', () => {
    step('01-collect.stage', 'run-A')
    expect(stateField('run_id')).toBe('run-A')

    const r2 = step('02-analyze.stage', 'run-B')
    expect(r2.stdout).toContain('BLOCKED (stale-state)')
    expect(assertStep('02-analyze.stage', 'run-B')).toBe(1)
    // state untouched by the refused run-B attempt: still run-A's step 1
    expect(stateField('run_id')).toBe('run-A')
    expect(stateField('step')).toBe('1')
  })
})

describe('F-PATTERN: degraded render leaves a recoverable state', () => {
  let slowDir: string

  beforeEach(() => {
    slowDir = mkdtempSync(join(tmpdir(), 'ls-pattern-slow-'))
    mkdirSync(join(slowDir, '.livestage'))
    writeFileSync(join(slowDir, '.livestage', 'policy.json'), JSON.stringify({
      code: { languages: ['javascript'], timeout: 30_000, runners: {} },
      filesystem: { write_enabled: true, write_root: 'cwd' },
    }))
    writeFileSync(join(slowDir, 'state.stage'), '---\nstep: "0"\n---\n\n# State\n')
    // Mimics a real step's shape: work first, state write last, so a
    // render killed mid-way (a hook timeout) never reaches the write.
    writeFileSync(join(slowDir, 'slow-step.stage'),
      '@code language="javascript"\nconst start = Date.now(); while (Date.now() - start < 1500) {}\n@code-end\n\n' +
      '@update-frontmatter path="state.stage" field="step" value="1" /\n\nDone.\n')
  })

  afterEach(() => {
    rmSync(slowDir, { recursive: true, force: true })
  })

  it('a render killed by a short timeout never reaches the state write, state stays valid', () => {
    const filePath = join(slowDir, 'slow-step.stage')
    const result = renderViaCli(filePath, 200) // shorter than the step's 1.5s of work
    expect(result.degraded).toBe(true)
    const content = readFileSync(join(slowDir, 'state.stage'), 'utf8')
    expect(content).toMatch(/step:\s*"0"/)
  })

  it('re-running the same step with no time pressure completes and updates state, no manual repair needed', () => {
    const filePath = join(slowDir, 'slow-step.stage')
    renderViaCli(filePath, 200) // first attempt: killed, degraded
    const result = renderViaCli(filePath, 10_000) // recovery: plenty of time
    expect(result.degraded).toBe(false)
    const content = readFileSync(join(slowDir, 'state.stage'), 'utf8')
    expect(content).toMatch(/step:\s*1/)
  })
})
