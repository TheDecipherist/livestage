import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadSecurityConfig, defaultSecurityConfig, strictSecurityConfig } from '../../../src/engine/security/config.js'
import { checkShellCommand } from '../../../src/engine/security/shell.js'
import { trustDirectory } from '../../../src/engine/security/trust.js'

// CR-5 / feature 10: policy is loaded fresh per invocation, project-local
// (.livestage/policy.json under cwd, not the user's home directory), and a
// policy edit takes effect on the very next read, no caching.
describe('security config: project-local, reloaded fresh', () => {
  let dir: string
  let homeDir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    if (homeDir) rmSync(homeDir, { recursive: true, force: true })
  })

  it('reads from .livestage/policy.json under the given cwd, not the home directory', () => {
    dir = mkdtempSync(join(tmpdir(), 'policy-cwd-'))
    homeDir = mkdtempSync(join(tmpdir(), 'policy-cwd-home-'))
    trustDirectory(dir, homeDir) // a real policy.json's grants require trust; see security/trust.ts
    mkdirSync(join(dir, '.livestage'), { recursive: true })
    writeFileSync(
      join(dir, '.livestage', 'policy.json'),
      JSON.stringify({ shell: { enabled: true, allow_patterns: ['echo *'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false } }),
    )
    const cfg = loadSecurityConfig(undefined, dir, homeDir)
    expect(cfg.shell.allow_patterns).toEqual(['echo *'])
  })

  it('a policy edit takes effect on the very next read, no caching across calls', () => {
    dir = mkdtempSync(join(tmpdir(), 'policy-reload-'))
    homeDir = mkdtempSync(join(tmpdir(), 'policy-reload-home-'))
    trustDirectory(dir, homeDir)
    mkdirSync(join(dir, '.livestage'), { recursive: true })
    const policyPath = join(dir, '.livestage', 'policy.json')

    writeFileSync(policyPath, JSON.stringify({
      shell: { enabled: true, allow_patterns: ['echo *'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false },
    }))
    const before = loadSecurityConfig(undefined, dir, homeDir)
    expect(checkShellCommand('echo hi', before.shell).allowed).toBe(true)

    writeFileSync(policyPath, JSON.stringify({
      shell: { enabled: true, allow_patterns: [], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false },
    }))
    const after = loadSecurityConfig(undefined, dir, homeDir)
    expect(checkShellCommand('echo hi', after.shell).allowed).toBe(false)
  })

  it('falls back to the default (deny-shaped) config when no policy file exists', () => {
    dir = mkdtempSync(join(tmpdir(), 'policy-missing-'))
    const cfg = loadSecurityConfig(undefined, dir)
    expect(cfg.filesystem.allowed_source_paths).toEqual([])
    expect(cfg.filesystem.allowed_data_paths).toEqual([])
  })
})

// Workspace trust (feature: "inherit the user's Claude Code permissions",
// closed out this session): a REAL policy.json's shell/code/http grants
// require the directory it governs to be explicitly trusted first, same
// model as Claude Code's own project-settings trust dialog. Untrusted
// still gets everything a policy.json can only RESTRICT (deny_patterns,
// the immutable always-block rules), it just gets none of what it grants.
describe('security config: workspace trust gates a real policy.json\'s grants', () => {
  let dir: string
  let homeDir: string

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    if (homeDir) rmSync(homeDir, { recursive: true, force: true })
  })

  function writePolicy(shellPatterns: string[], denyPatterns: string[] = []) {
    mkdirSync(join(dir, '.livestage'), { recursive: true })
    writeFileSync(join(dir, '.livestage', 'policy.json'), JSON.stringify({
      shell: { enabled: true, allow_patterns: shellPatterns, deny_patterns: denyPatterns, allow_network: false, require_confirmation: false, audit_log: false },
      code: { languages: ['javascript'], timeout: 30_000, runners: {} },
      http: { enabled: true, allowed_domains: [], denied_domains: [], allowed_methods: ['GET'], max_response_size: 1_048_576, timeout: 10_000 },
    }))
  }

  it('an untrusted directory\'s policy.json grants nothing for shell, code, or http', () => {
    dir = mkdtempSync(join(tmpdir(), 'policy-untrusted-'))
    homeDir = mkdtempSync(join(tmpdir(), 'policy-untrusted-home-'))
    writePolicy(['echo *'])
    const cfg = loadSecurityConfig(undefined, dir, homeDir)
    expect(cfg.shell.enabled).toBe(false)
    expect(cfg.shell.allow_patterns).toEqual([])
    expect(cfg.code.languages).toEqual([])
    expect(cfg.http.enabled).toBe(false)
  })

  it('the same policy.json grants normally once the directory is trusted', () => {
    dir = mkdtempSync(join(tmpdir(), 'policy-trusted-'))
    homeDir = mkdtempSync(join(tmpdir(), 'policy-trusted-home-'))
    writePolicy(['echo *'])
    trustDirectory(dir, homeDir)
    const cfg = loadSecurityConfig(undefined, dir, homeDir)
    expect(cfg.shell.enabled).toBe(true)
    expect(cfg.shell.allow_patterns).toEqual(['echo *'])
    expect(cfg.code.languages).toEqual(['javascript'])
    expect(cfg.http.enabled).toBe(true)
  })

  it('deny_patterns apply from an untrusted directory too: trust only gates grants, never restrictions', () => {
    dir = mkdtempSync(join(tmpdir(), 'policy-untrusted-deny-'))
    homeDir = mkdtempSync(join(tmpdir(), 'policy-untrusted-deny-home-'))
    writePolicy(['echo *'], ['curl *'])
    const cfg = loadSecurityConfig(undefined, dir, homeDir)
    // Even though shell itself is now disabled (untrusted grants nothing),
    // the deny list the file specified is preserved on the returned
    // config, not silently discarded, matching the "restrictions apply
    // regardless of trust" model even when there is nothing left to check
    // it against in this particular case (shell already disabled).
    expect(cfg.shell.deny_patterns).toEqual(['curl *'])
  })

  it('a directory with no policy.json at all is unaffected by trust (the tool\'s own shipped default, not a file to distrust)', () => {
    dir = mkdtempSync(join(tmpdir(), 'policy-none-'))
    homeDir = mkdtempSync(join(tmpdir(), 'policy-none-home-'))
    const cfg = loadSecurityConfig(undefined, dir, homeDir)
    // defaultSecurityConfig()'s own permissive shell allowlist, untouched:
    // there is no file here for an attacker to have planted.
    expect(cfg.shell.enabled).toBe(true)
    expect(cfg.shell.allow_patterns.length).toBeGreaterThan(0)
  })
})

// strictSecurityConfig() is what `init` seeds into a fresh project (feature
// 31's bug fix): distinct from defaultSecurityConfig(), which stays
// permissive (shell enabled, ~40 wildcard allow_patterns) because it also
// serves as the fallback for a project with no policy file at all.
describe('strictSecurityConfig vs defaultSecurityConfig', () => {
  it('ships shell off with no patterns granted, unlike the permissive default', () => {
    const strict = strictSecurityConfig()
    expect(strict.shell.enabled).toBe(false)
    expect(strict.shell.allow_patterns).toEqual([])

    const permissive = defaultSecurityConfig()
    expect(permissive.shell.enabled).toBe(true)
    expect(permissive.shell.allow_patterns.length).toBeGreaterThan(0)
  })

  it('agrees with the default profile everywhere else: @code and http stay off in both', () => {
    const strict = strictSecurityConfig()
    const permissive = defaultSecurityConfig()
    expect(strict.code).toEqual(permissive.code)
    expect(strict.http).toEqual(permissive.http)
  })
})
