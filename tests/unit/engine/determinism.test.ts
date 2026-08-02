import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'
import { buildDeterminism } from '../../../src/engine/determinism.js'

describe('buildDeterminism', () => {
  it('returns null when LIVESTAGE_DETERMINISTIC is unset', () => {
    expect(buildDeterminism({})).toBeNull()
  })

  it('returns null when LIVESTAGE_DETERMINISTIC is set to something other than "1"', () => {
    expect(buildDeterminism({ LIVESTAGE_DETERMINISTIC: 'true' })).toBeNull()
  })

  it('freezes now to LIVESTAGE_NOW when both are set', () => {
    const state = buildDeterminism({ LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_NOW: '2026-01-01T00:00:00.000Z' })
    expect(state?.now.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  it('falls back to a real Date when LIVESTAGE_NOW is missing or unparseable, without disabling determinism', () => {
    const missing = buildDeterminism({ LIVESTAGE_DETERMINISTIC: '1' })
    expect(missing).not.toBeNull()
    expect(missing?.now).toBeInstanceOf(Date)

    const bad = buildDeterminism({ LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_NOW: 'not-a-date' })
    expect(bad).not.toBeNull()
    expect(bad?.now).toBeInstanceOf(Date)
  })

  it('the explicit flag turns on determinism without the env var', () => {
    const state = buildDeterminism({}, true)
    expect(state).not.toBeNull()
  })

  it('the same seed produces the same uuid sequence across two independent states', () => {
    const a = buildDeterminism({ LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_SEED: 'seed-x' })!
    const b = buildDeterminism({ LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_SEED: 'seed-x' })!
    const seqA = [a.nextUuid(), a.nextUuid(), a.nextUuid()]
    const seqB = [b.nextUuid(), b.nextUuid(), b.nextUuid()]
    expect(seqA).toEqual(seqB)
  })

  it('different seeds produce different uuid sequences', () => {
    const a = buildDeterminism({ LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_SEED: 'seed-x' })!
    const b = buildDeterminism({ LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_SEED: 'seed-y' })!
    expect(a.nextUuid()).not.toBe(b.nextUuid())
  })

  it('uuid output is RFC4122 v4-shaped', () => {
    const state = buildDeterminism({ LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_SEED: 'shape-check' })!
    expect(state.nextUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('determinism wired into rendering', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-det-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function run(src: string, env: Record<string, string>) {
    const filePath = join(dir, 'doc.stage')
    const ast = parse(src, { filePath })
    return execute(ast, {
      filePath,
      ctx: {
        cwd: dir,
        env,
        security: { allowShell: true, allowHttp: false, allowDb: false, jailRoot: dir },
      },
    })
  }

  it('@date reflects LIVESTAGE_NOW under deterministic mode, not wall-clock time', () => {
    const result = run('@date /', { LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_NOW: '2030-06-15T12:00:00.000Z' })
    expect(result.output.trim()).toBe('2030-06-15T12:00:00.000Z')
  })

  it('{{ now_iso() }} and {{ now_ms() }} reflect the frozen clock', () => {
    const result = run('{{ now_iso() }} | {{ now_ms() }}', { LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_NOW: '2030-06-15T12:00:00.000Z' })
    expect(result.output).toContain('2030-06-15T12:00:00.000Z')
    expect(result.output).toContain(String(new Date('2030-06-15T12:00:00.000Z').getTime()))
  })

  it('two renders of the same document with the same env are byte-identical, including uuid_v4() output', () => {
    const src = '{{ now_iso() }} {{ uuid_v4() }} {{ uuid_v4() }}\n@date /\n'
    const env = { LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_NOW: '2030-01-01T00:00:00.000Z', LIVESTAGE_SEED: 'suite-seed' }
    const first = run(src, env)
    const second = run(src, env)
    expect(first.output).toBe(second.output)
  })

  it('@query mock= serves the fixture instead of executing the command', () => {
    writeFileSync(join(dir, 'fixture.txt'), 'mocked output\n')
    const result = run('@query "echo should-not-run" mock="fixture.txt" /', { LIVESTAGE_DETERMINISTIC: '1' })
    expect(result.output.trim()).toBe('mocked output')
  })

  it('@code mock= serves the fixture instead of spawning the runner', () => {
    writeFileSync(join(dir, 'fixture.txt'), 'mocked code output\n')
    const result = run('@code language="javascript" mock="fixture.txt"\nconsole.log("should-not-run")\n@code-end', { LIVESTAGE_DETERMINISTIC: '1' })
    expect(result.output.trim()).toBe('mocked code output')
  })

  it('without determinism, uuid_v4() calls produce different values', () => {
    const result = run('{{ uuid_v4() }}|{{ uuid_v4() }}', {})
    const [a, b] = result.output.split('|')
    expect(a).not.toBe(b)
  })
})
