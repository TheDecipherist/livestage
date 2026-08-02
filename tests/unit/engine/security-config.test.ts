import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadSecurityConfig } from '../../../src/engine/security/config.js'
import { checkShellCommand } from '../../../src/engine/security/shell.js'

// CR-5 / feature 10: policy is loaded fresh per invocation, project-local
// (.livestage/policy.json under cwd, not the user's home directory), and a
// policy edit takes effect on the very next read, no caching.
describe('security config: project-local, reloaded fresh', () => {
  let dir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('reads from .livestage/policy.json under the given cwd, not the home directory', () => {
    dir = mkdtempSync(join(tmpdir(), 'policy-cwd-'))
    mkdirSync(join(dir, '.livestage'), { recursive: true })
    writeFileSync(
      join(dir, '.livestage', 'policy.json'),
      JSON.stringify({ shell: { enabled: true, allow_patterns: ['echo *'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false } }),
    )
    const cfg = loadSecurityConfig(undefined, dir)
    expect(cfg.shell.allow_patterns).toEqual(['echo *'])
  })

  it('a policy edit takes effect on the very next read, no caching across calls', () => {
    dir = mkdtempSync(join(tmpdir(), 'policy-reload-'))
    mkdirSync(join(dir, '.livestage'), { recursive: true })
    const policyPath = join(dir, '.livestage', 'policy.json')

    writeFileSync(policyPath, JSON.stringify({
      shell: { enabled: true, allow_patterns: ['echo *'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false },
    }))
    const before = loadSecurityConfig(undefined, dir)
    expect(checkShellCommand('echo hi', before.shell).allowed).toBe(true)

    writeFileSync(policyPath, JSON.stringify({
      shell: { enabled: true, allow_patterns: [], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false },
    }))
    const after = loadSecurityConfig(undefined, dir)
    expect(checkShellCommand('echo hi', after.shell).allowed).toBe(false)
  })

  it('falls back to the default (deny-shaped) config when no policy file exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'policy-missing-'))
    const cfg = loadSecurityConfig(undefined, dir)
    expect(cfg.filesystem.allowed_source_paths).toEqual([])
    expect(cfg.filesystem.allowed_data_paths).toEqual([])
  })
})
