import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isTrusted, trustDirectory, untrustDirectory, listTrustedDirectories } from '../../../src/engine/security/trust.js'

describe('workspace trust store', () => {
  let homeDir: string
  let projectDir: string

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'ls-trust-home-'))
    projectDir = mkdtempSync(join(tmpdir(), 'ls-trust-proj-'))
  })

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  it('a directory is untrusted until explicitly trusted', () => {
    expect(isTrusted(projectDir, homeDir)).toBe(false)
  })

  it('trustDirectory records the directory, isTrusted then reports it', () => {
    const result = trustDirectory(projectDir, homeDir)
    expect(result.added).toBe(true)
    expect(isTrusted(projectDir, homeDir)).toBe(true)
  })

  it('trusting the same directory twice is idempotent', () => {
    trustDirectory(projectDir, homeDir)
    const second = trustDirectory(projectDir, homeDir)
    expect(second.added).toBe(false)
    expect(listTrustedDirectories(homeDir)).toHaveLength(1)
  })

  it('trust is recorded outside the project directory, under the home dir', () => {
    trustDirectory(projectDir, homeDir)
    const storePath = join(homeDir, '.livestage', 'trust.json')
    expect(existsSync(storePath)).toBe(true)
    expect(existsSync(join(projectDir, '.livestage', 'trust.json'))).toBe(false)
    const raw = JSON.parse(readFileSync(storePath, 'utf8')) as { trusted: string[] }
    expect(raw.trusted).toContain(projectDir)
  })

  it('untrustDirectory removes a trusted directory', () => {
    trustDirectory(projectDir, homeDir)
    const result = untrustDirectory(projectDir, homeDir)
    expect(result.removed).toBe(true)
    expect(isTrusted(projectDir, homeDir)).toBe(false)
  })

  it('untrusting a directory that was never trusted is a no-op, not an error', () => {
    const result = untrustDirectory(projectDir, homeDir)
    expect(result.removed).toBe(false)
  })

  it('relative and absolute forms of the same directory resolve to the same trust entry', () => {
    trustDirectory(projectDir, homeDir)
    const relative = join(projectDir, '..', projectDir.split('/').pop()!)
    expect(isTrusted(relative, homeDir)).toBe(true)
  })

  it('listTrustedDirectories returns every trusted path', () => {
    const other = mkdtempSync(join(tmpdir(), 'ls-trust-other-'))
    try {
      trustDirectory(projectDir, homeDir)
      trustDirectory(other, homeDir)
      expect(listTrustedDirectories(homeDir).sort()).toEqual([projectDir, other].sort())
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })
})
