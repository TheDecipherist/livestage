import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parsePermissionRule, readClaudeSettingsScopes, mergeScopePermissions,
  checkShellCommandWithSettings, deriveShellAllowPatternsFromSettings,
} from '../../../src/engine/security/claude-settings.js'
import type { ShellSecurityConfig } from '../../../src/engine/security/config.js'

describe('parsePermissionRule', () => {
  it('parses a bare tool with no specifier', () => {
    expect(parsePermissionRule('Bash')).toEqual({ raw: 'Bash', tool: 'Bash' })
  })

  it('parses a Tool(specifier) rule', () => {
    expect(parsePermissionRule('Bash(npm run test *)')).toEqual({
      raw: 'Bash(npm run test *)', tool: 'Bash', specifier: 'npm run test *',
    })
  })

  it('normalizes "Tool(cmd:*)" shorthand to "Tool(cmd *)"', () => {
    expect(parsePermissionRule('Bash(ls:*)').specifier).toBe('ls *')
  })
})

describe('reading and merging Claude Code settings scopes', () => {
  let cwd: string
  let homeDir: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ls-settings-cwd-'))
    homeDir = mkdtempSync(join(tmpdir(), 'ls-settings-home-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
    rmSync(homeDir, { recursive: true, force: true })
  })

  function writeSettings(path: string, permissions: Record<string, string[]>): void {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, JSON.stringify({ permissions }), 'utf8')
  }

  it('reads project-shared, project-local, and user scopes when present', () => {
    writeSettings(join(cwd, '.claude', 'settings.json'), { allow: ['Bash(git *)'] })
    writeSettings(join(cwd, '.claude', 'settings.local.json'), { deny: ['Bash(curl *)'] })
    writeSettings(join(homeDir, '.claude', 'settings.json'), { ask: ['Bash(docker *)'] })

    const scopes = readClaudeSettingsScopes({ cwd, homeDir })
    const labels = scopes.map(s => s.label).sort()
    expect(labels).toEqual(['project-local', 'project-shared', 'user'])

    const merged = mergeScopePermissions(scopes)
    expect(merged.allow).toEqual(['Bash(git *)'])
    expect(merged.deny).toEqual(['Bash(curl *)'])
    expect(merged.ask).toEqual(['Bash(docker *)'])
  })

  it('a missing scope is silently absent, not an error', () => {
    const scopes = readClaudeSettingsScopes({ cwd, homeDir })
    expect(scopes).toEqual([])
    expect(mergeScopePermissions(scopes)).toEqual({ allow: [], deny: [], ask: [] })
  })

  it('rules merge across scopes rather than one scope overriding another', () => {
    writeSettings(join(cwd, '.claude', 'settings.json'), { deny: ['Bash(a *)'] })
    writeSettings(join(homeDir, '.claude', 'settings.json'), { deny: ['Bash(b *)'] })
    const merged = mergeScopePermissions(readClaudeSettingsScopes({ cwd, homeDir }))
    expect(merged.deny.sort()).toEqual(['Bash(a *)', 'Bash(b *)'])
  })
})

describe('checkShellCommandWithSettings: deny/ask always apply, allow only narrows', () => {
  const livestageAllowsGit: ShellSecurityConfig = {
    enabled: true, allow_patterns: ['git *'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false,
  }

  it('settings deny blocks a command livestage policy would otherwise allow', () => {
    const result = checkShellCommandWithSettings('git push origin main', livestageAllowsGit, {
      allow: [], deny: ['Bash(git push *)'], ask: [],
    })
    expect(result.allowed).toBe(false)
  })

  it('settings ask is treated as deny: no one to ask during an unsupervised render', () => {
    const result = checkShellCommandWithSettings('git push origin main', livestageAllowsGit, {
      allow: [], deny: [], ask: ['Bash(git push *)'],
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/no one to ask/)
  })

  it('empty settings.allow expresses no opinion: livestage policy governs alone', () => {
    // The confirmed decision (2026-08-17): a literal intersection-with-empty-set
    // reading would deny everything whenever the user's real settings.json has
    // no Bash allow rules at all, the common case. No narrowing when settings
    // has nothing to say about Bash.
    const result = checkShellCommandWithSettings('git status', livestageAllowsGit, { allow: [], deny: [], ask: [] })
    expect(result.allowed).toBe(true)
  })

  it('a livestage-allowed command not covered by any settings Bash allow rule is narrowed away', () => {
    const result = checkShellCommandWithSettings('git status', livestageAllowsGit, {
      allow: ['Bash(git log *)'], deny: [], ask: [],
    })
    expect(result.allowed).toBe(false)
    expect(result.reason).toMatch(/not covered by any Claude Code settings/)
  })

  it('settings allow never widens what livestage policy already denies', () => {
    const result = checkShellCommandWithSettings('curl https://evil.example', livestageAllowsGit, {
      allow: ['Bash(curl *)'], deny: [], ask: [],
    })
    expect(result.allowed).toBe(false) // livestage's own policy never granted curl
  })

  it('a compound command is checked per subcommand against both sources together', () => {
    const cfg: ShellSecurityConfig = { ...livestageAllowsGit, allow_patterns: ['git *', 'echo *'] }
    const denied = checkShellCommandWithSettings('git status && echo hi', cfg, {
      allow: [], deny: ['Bash(echo *)'], ask: [],
    })
    expect(denied.allowed).toBe(false)

    const allowed = checkShellCommandWithSettings('git status && echo hi', cfg, { allow: [], deny: [], ask: [] })
    expect(allowed.allowed).toBe(true)
  })
})

describe('deriveShellAllowPatternsFromSettings', () => {
  it('extracts Bash specifiers, ignores non-Bash tools and bare-tool rules', () => {
    const patterns = deriveShellAllowPatternsFromSettings({
      allow: ['Bash(npm run test *)', 'Bash(git commit *)', 'Read(**)', 'Bash'],
      deny: [], ask: [],
    })
    expect(patterns).toEqual(['npm run test *', 'git commit *'])
  })

  it('deduplicates identical specifiers', () => {
    const patterns = deriveShellAllowPatternsFromSettings({
      allow: ['Bash(git *)', 'Bash(git *)'], deny: [], ask: [],
    })
    expect(patterns).toEqual(['git *'])
  })
})
