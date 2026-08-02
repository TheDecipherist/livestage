import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInit } from '../../../src/cli/commands/init.js'

// Wave 4, feature 31 (Init): a real, working replacement for the previous
// donor-inherited hook registration, which installed a content-sniffing
// .md-blocking script entirely disconnected from the real hook this
// project built (src/hook/pretooluse.ts, feature 11). Registers the
// installed package's actual dist/hook/pretooluse.js, and seeds the
// project's .livestage/policy.json, neither of which had any test coverage
// before this wave (the file that tested the old, wrong hook is deleted,
// not fixed).
describe('runInit', () => {
  let homeDir: string
  let projectDir: string

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'ls-init-home-'))
    projectDir = mkdtempSync(join(tmpdir(), 'ls-init-proj-'))
  })

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  it('registers the PreToolUse hook pointing at the real built pretooluse.js, not a wrapper script', () => {
    const result = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(result.success).toBe(true)
    const settings = JSON.parse(readFileSync(result.configPath, 'utf8')) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> }
    }
    const command = settings.hooks.PreToolUse[0]?.hooks[0]?.command ?? ''
    expect(command).toContain('dist/hook/pretooluse.js')
    // No separate wrapper file written under ~/.livestage/hooks/preToolUse.mjs.
    expect(existsSync(join(homeDir, '.livestage', 'hooks', 'preToolUse.mjs'))).toBe(false)
  })

  it('seeds .livestage/policy.json with the strict (default) profile', () => {
    const result = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(result.success).toBe(true)
    const policyPath = join(projectDir, '.livestage', 'policy.json')
    expect(existsSync(policyPath)).toBe(true)
    const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as { code: { languages: string[] } }
    expect(policy.code.languages).toEqual([])
  })

  it('running init twice is idempotent: does not overwrite an existing policy or duplicate the hook entry', () => {
    runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    const policyPath = join(projectDir, '.livestage', 'policy.json')
    const firstPolicy = readFileSync(policyPath, 'utf8')

    const second = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(second.alreadyInstalled).toBe(true)
    expect(readFileSync(policyPath, 'utf8')).toBe(firstPolicy)

    const settings = JSON.parse(readFileSync(second.configPath, 'utf8')) as { hooks: { PreToolUse: unknown[] } }
    expect(settings.hooks.PreToolUse).toHaveLength(1)
  })

  it('also registers a SessionStart hook', () => {
    runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    const settings = JSON.parse(readFileSync(join(homeDir, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { SessionStart: unknown[] }
    }
    expect(settings.hooks.SessionStart).toHaveLength(1)
  })

  it('preserves existing unrelated hook entries when installing', () => {
    const settingsPath = join(homeDir, '.claude', 'settings.json')
    mkdirSync(join(homeDir, '.claude'), { recursive: true })
    writeFileSync(settingsPath, JSON.stringify({
      hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'node other-hook.js' }] }] },
    }), 'utf8')

    runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as { hooks: { PreToolUse: Array<{ matcher: string }> } }
    expect(settings.hooks.PreToolUse.some(e => e.matcher === 'Bash')).toBe(true)
    expect(settings.hooks.PreToolUse.some(e => e.matcher === 'Read')).toBe(true)
  })
})
