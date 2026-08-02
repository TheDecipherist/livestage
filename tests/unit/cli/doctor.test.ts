import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDoctor, runDoctorRulesFor } from '../../../src/cli/commands/doctor.js'
import { runInit } from '../../../src/cli/commands/init.js'

// Wave 4, feature 30 (Doctor): [new], no donor source. A read-only
// aggregator over feature 10 (policy), 12 (trace path), 27 (assertion
// liveness); does not own any of that logic itself.
describe('runDoctor', () => {
  let cwd: string
  let homeDir: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ls-doctor-'))
    homeDir = mkdtempSync(join(tmpdir(), 'ls-doctor-home-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(homeDir, { recursive: true, force: true })
  })

  it('is unhealthy before init (hook not registered)', () => {
    const health = runDoctor({ cwd, homeDir })
    expect(health.healthy).toBe(false)
    expect(health.checks.find(c => c.name === 'hooks')?.healthy).toBe(false)
  })

  it('is healthy immediately after a successful init', () => {
    runInit({ client: 'claude-code', homeDir, cwd })
    const health = runDoctor({ cwd, homeDir })
    expect(health.healthy).toBe(true)
    expect(health.checks.every(c => c.healthy)).toBe(true)
  })

  it('reports a named failure for a .stage file that fails to parse', () => {
    runInit({ client: 'claude-code', homeDir, cwd })
    writeFileSync(join(cwd, 'broken.stage'), '@if true\nunclosed\n')
    const health = runDoctor({ cwd, homeDir })
    expect(health.healthy).toBe(false)
    const check = health.checks.find(c => c.name === 'docsParsed')
    expect(check?.healthy).toBe(false)
    expect(check?.detail).toContain('broken.stage')
  })

  it('reports the exact version from package.json', () => {
    const health = runDoctor({ cwd, homeDir })
    expect(health.version).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it('flags an inert assertion document', () => {
    runInit({ client: 'claude-code', homeDir, cwd })
    writeFileSync(join(cwd, 'inert.stage'), '@assert operator="absent" target="x.txt" pattern="y" /\n')
    const health = runDoctor({ cwd, homeDir })
    const check = health.checks.find(c => c.name === 'assertions')
    expect(check?.detail).toContain('1 inert doc')
    expect(check?.healthy).toBe(false)
  })

  it('fails an intentionally malformed schema file (feature 32, CR-adjacent)', () => {
    runInit({ client: 'claude-code', homeDir, cwd })
    mkdirSync(join(cwd, '.livestage', 'schemas'), { recursive: true })
    writeFileSync(join(cwd, '.livestage', 'schemas', 'broken.json'), 'not valid json')
    const health = runDoctor({ cwd, homeDir })
    expect(health.healthy).toBe(false)
    const check = health.checks.find(c => c.name === 'schemas')
    expect(check?.healthy).toBe(false)
    expect(check?.detail).toContain('broken.json')
  })

  it('checks a nested project structure, not just the top level', () => {
    runInit({ client: 'claude-code', homeDir, cwd })
    mkdirSync(join(cwd, 'sub'), { recursive: true })
    writeFileSync(join(cwd, 'sub', 'nested.stage'), '# fine\n')
    const health = runDoctor({ cwd, homeDir })
    expect(health.checks.find(c => c.name === 'docsParsed')?.detail).toContain('1/1')
  })
})

describe('runDoctorRulesFor', () => {
  let cwd: string

  beforeEach(() => { cwd = mkdtempSync(join(tmpdir(), 'ls-doctor-rules-')) })
  afterEach(() => { rmSync(cwd, { recursive: true, force: true }) })

  it('lists assertion documents whose targets match the file, with real pass state and coverage', () => {
    writeFileSync(join(cwd, 'target.txt'), 'hello')
    writeFileSync(join(cwd, 'pass.stage'), '@assert operator="contains" target="target.txt" pattern="hello" /\n')
    writeFileSync(join(cwd, 'fail.stage'), '@assert operator="contains" target="target.txt" pattern="nowhere" /\n')

    const result = runDoctorRulesFor('target.txt', { cwd })
    expect(result.matches).toHaveLength(2)
    expect(result.matches.find(m => m.file === 'pass.stage')?.passed).toBe(true)
    expect(result.matches.find(m => m.file === 'fail.stage')?.passed).toBe(false)
    expect(result.coverage).toBe(0.5)
  })

  it('returns zero matches and zero coverage for a file no assertion targets', () => {
    writeFileSync(join(cwd, 'unrelated.stage'), '@assert operator="file-exists" target="other.txt" /\n')
    const result = runDoctorRulesFor('target.txt', { cwd })
    expect(result.matches).toHaveLength(0)
    expect(result.coverage).toBe(0)
  })
})
