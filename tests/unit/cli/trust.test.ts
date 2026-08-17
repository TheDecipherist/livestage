import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { runTrust } from '../../../src/cli/commands/trust.js'
import { isTrusted } from '../../../src/engine/security/trust.js'

describe('runTrust', () => {
  let homeDir: string
  let projectDir: string

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'ls-trust-cli-home-'))
    projectDir = mkdtempSync(join(tmpdir(), 'ls-trust-cli-proj-'))
  })

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  it('trusts the given directory', () => {
    const result = runTrust({ dir: projectDir, homeDir })
    expect(result.action).toBe('trusted')
    expect(isTrusted(projectDir, homeDir)).toBe(true)
  })

  it('defaults to trusting cwd when no dir is given', () => {
    const result = runTrust({ cwd: projectDir, homeDir })
    expect(result.path).toBe(resolve(projectDir))
    expect(isTrusted(projectDir, homeDir)).toBe(true)
  })

  it('trusting twice reports already-trusted', () => {
    runTrust({ dir: projectDir, homeDir })
    const second = runTrust({ dir: projectDir, homeDir })
    expect(second.action).toBe('already-trusted')
  })

  it('--list lists trusted directories', () => {
    runTrust({ dir: projectDir, homeDir })
    const result = runTrust({ list: true, homeDir })
    expect(result.action).toBe('list')
    expect(result.entries).toEqual([resolve(projectDir)])
  })

  it('--list with nothing trusted says so', () => {
    const result = runTrust({ list: true, homeDir })
    expect(result.entries).toEqual([])
    expect(result.message).toContain('No trusted directories')
  })

  it('--remove untrusts a trusted directory', () => {
    runTrust({ dir: projectDir, homeDir })
    const result = runTrust({ dir: projectDir, homeDir, remove: true })
    expect(result.action).toBe('untrusted')
    expect(isTrusted(projectDir, homeDir)).toBe(false)
  })

  it('--remove on an untrusted directory reports not-trusted, not an error', () => {
    const result = runTrust({ dir: projectDir, homeDir, remove: true })
    expect(result.action).toBe('not-trusted')
  })
})
