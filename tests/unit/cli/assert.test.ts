import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runAssert } from '../../../src/cli/commands/assert.js'

// Wave 3, feature 28 (CI Mode): `assert <file|glob>` exit codes.
describe('runAssert', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-assert-cli-'))
    writeFileSync(join(dir, 'present.txt'), 'hello')
    writeFileSync(join(dir, 'good.stage'), '@assert operator="contains" target="present.txt" pattern="hello" /\n')
    writeFileSync(join(dir, 'bad.stage'), '@assert operator="contains" target="present.txt" pattern="nowhere" /\n')
    writeFileSync(join(dir, 'invalid.stage'), '@call undefined_macro /\n')
  })

  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('exit 0 when every assertion in the file passes', () => {
    const run = runAssert('good.stage', { cwd: dir })
    expect(run.exitCode).toBe(0)
  })

  it('exit 1 when any assertion fails', () => {
    const run = runAssert('bad.stage', { cwd: dir })
    expect(run.exitCode).toBe(1)
  })

  it('exit 2 when the document itself is invalid', () => {
    const run = runAssert('invalid.stage', { cwd: dir })
    expect(run.exitCode).toBe(2)
  })

  it('exit 2 when the glob matches nothing', () => {
    const run = runAssert('nope-*.stage', { cwd: dir })
    expect(run.exitCode).toBe(2)
  })

  it('a glob aggregates across files: an invalid document anywhere in the glob wins (exit 2)', () => {
    const run = runAssert('*.stage', { cwd: dir })
    expect(run.files.length).toBeGreaterThanOrEqual(3)
    expect(run.exitCode).toBe(2)
  })

  it('a glob with only valid, mixed pass/fail documents exits 1 (not 2) on any failure', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'ls-assert-cli-mixed-'))
    try {
      writeFileSync(join(scratch, 'x.txt'), 'hello')
      writeFileSync(join(scratch, 'g.stage'), '@assert operator="contains" target="x.txt" pattern="hello" /\n')
      writeFileSync(join(scratch, 'b.stage'), '@assert operator="contains" target="x.txt" pattern="nowhere" /\n')
      const run = runAssert('*.stage', { cwd: scratch })
      expect(run.exitCode).toBe(1)
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
