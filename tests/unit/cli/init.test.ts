import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
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

  it('registers the render-substitution hook under PostToolUse, pointing at the real built pretooluse.js', () => {
    const result = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(result.success).toBe(true)
    const settings = JSON.parse(readFileSync(result.configPath, 'utf8')) as {
      hooks: { PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> }
    }
    const entry = settings.hooks.PostToolUse.find(e => e.hooks[0]?.command.includes('dist/hook/pretooluse.js'))
    expect(entry?.matcher).toBe('Read')
    // Never under PreToolUse: PreToolUse can only allow/deny/rewrite tool
    // ARGUMENTS, it cannot substitute the content a Read call returns, so a
    // registration there would silently never render anything.
    expect(existsSync(join(homeDir, '.livestage', 'hooks', 'preToolUse.mjs'))).toBe(false)
  })

  it('never registers the render-substitution hook under PreToolUse', () => {
    const result = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(result.success).toBe(true)
    const settings = JSON.parse(readFileSync(result.configPath, 'utf8')) as {
      hooks: { PreToolUse?: Array<{ hooks: Array<{ command: string }> }> }
    }
    const underPreToolUse = (settings.hooks.PreToolUse ?? []).some(e =>
      e.hooks.some(h => h.command.includes('dist/hook/pretooluse.js')))
    expect(underPreToolUse).toBe(false)
  })

  // The real deliverable for the hook-registration bug fix (see doc 11's
  // known_issues): this test fails if the registration key and the value
  // the hook itself emits at runtime ever diverge again, regardless of
  // which one someone next edits by hand. It reads the actual hook source
  // rather than hardcoding 'PostToolUse' twice, so a future, deliberate
  // change to the emitted hookEventName (should Claude Code's hook API
  // change again) is caught here before it becomes a silent mismatch.
  it('the registered hook key matches the hookEventName the hook module itself emits', () => {
    const result = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(result.success).toBe(true)
    const settings = JSON.parse(readFileSync(result.configPath, 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }
    const hookSource = readFileSync(
      join(dirname(new URL(import.meta.url).pathname), '../../../src/hook/pretooluse.ts'),
      'utf8',
    )
    const emittedMatch = hookSource.match(/hookEventName:\s*'([A-Za-z]+)'/)
    expect(emittedMatch, 'pretooluse.ts must emit a literal hookEventName').not.toBeNull()
    const emittedEventName = emittedMatch![1]!

    const registeredUnder = Object.entries(settings.hooks).find(([, entries]) =>
      entries.some(e => e.hooks.some(h => h.command.includes('dist/hook/pretooluse.js'))))?.[0]
    expect(registeredUnder).toBe(emittedEventName)
  })

  // Previously only checked code.languages, which is empty in both the
  // strict profile AND the permissive defaultSecurityConfig() fallback, so
  // it passed vacuously while init actually seeded ~40 shell wildcard
  // patterns (defaultSecurityConfig(), not the strict profile the code's
  // own comment claimed). Asserts the field that actually distinguishes
  // the two profiles.
  it('seeds .livestage/policy.json with the real strict profile: shell off, no patterns granted', () => {
    const result = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(result.success).toBe(true)
    const policyPath = join(projectDir, '.livestage', 'policy.json')
    expect(existsSync(policyPath)).toBe(true)
    const policy = JSON.parse(readFileSync(policyPath, 'utf8')) as {
      code: { languages: string[] }
      shell: { enabled: boolean; allow_patterns: string[] }
      http: { enabled: boolean }
    }
    expect(policy.code.languages).toEqual([])
    expect(policy.shell.enabled).toBe(false)
    expect(policy.shell.allow_patterns).toEqual([])
    expect(policy.http.enabled).toBe(false)
  })

  // "inherit the user's Claude Code permissions", point 3: init reads
  // settings.allow to SEED a suggested policy, it never auto-writes one.
  // runInit itself stays a pure function; the CLI layer (cli.ts's
  // --seed-from-permissions flag) is what derives the seed and passes it
  // in via policySeed, tested here at the library boundary.
  it('policySeed overrides the strict default when the caller supplies one', () => {
    const result = runInit({
      client: 'claude-code', homeDir, cwd: projectDir,
      policySeed: {
        shell: { enabled: true, allow_patterns: ['git status', 'echo *'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: true },
        http: { enabled: false, allowed_domains: [], denied_domains: [], allowed_methods: ['GET'], max_response_size: 1_048_576, timeout: 10_000 },
        db: {},
        filesystem: { allowed_source_paths: [], allowed_data_paths: [], additional_block_paths: [], additional_block_patterns: [], allow_unmasked_paths: [], allow_unmasked_patterns: [], user_masking_patterns: [] },
        event: { allowed_transports: [], allow_env_interpolation: false, max_value_length: 500, onError: 'silence' },
        code: { languages: [], timeout: 30_000, runners: {} },
      },
    })
    expect(result.success).toBe(true)
    const policy = JSON.parse(readFileSync(join(projectDir, '.livestage', 'policy.json'), 'utf8')) as {
      shell: { enabled: boolean; allow_patterns: string[] }
    }
    expect(policy.shell.enabled).toBe(true)
    expect(policy.shell.allow_patterns).toEqual(['git status', 'echo *'])
  })

  it('without policySeed, the strict default is unaffected by an unrelated caller-supplied option', () => {
    const result = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    const policy = JSON.parse(readFileSync(join(projectDir, '.livestage', 'policy.json'), 'utf8')) as {
      shell: { enabled: boolean }
    }
    expect(result.success).toBe(true)
    expect(policy.shell.enabled).toBe(false)
  })

  it('running init twice is idempotent: does not overwrite an existing policy or duplicate the hook entry', () => {
    runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    const policyPath = join(projectDir, '.livestage', 'policy.json')
    const firstPolicy = readFileSync(policyPath, 'utf8')

    const second = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(second.alreadyInstalled).toBe(true)
    expect(readFileSync(policyPath, 'utf8')).toBe(firstPolicy)

    const settings = JSON.parse(readFileSync(second.configPath, 'utf8')) as { hooks: { PostToolUse: unknown[] } }
    expect(settings.hooks.PostToolUse).toHaveLength(1)
  })

  // Business rule 1 (re-run is a no-op) plus the migration this bug fix
  // adds: an install from before the PreToolUse->PostToolUse fix left the
  // render-substitution hook registered under the wrong key. Re-running
  // init after upgrading must move it, not add a second, correct copy
  // alongside the dead one.
  it('running init after upgrading migrates a stale PreToolUse registration rather than adding a second entry', () => {
    const first = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    const settingsPath = first.configPath
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: { PostToolUse: Array<{ matcher: string; hooks: Array<{ command: string }> }> }
    }
    const command = settings.hooks.PostToolUse[0]!.hooks[0]!.command
    // Simulate a pre-fix install: the same hook command, but filed under
    // the old, wrong key, with nothing under PostToolUse.
    settings.hooks = {
      PreToolUse: [{ matcher: 'Read', hooks: [{ type: 'command', command }] }],
    } as unknown as typeof settings.hooks
    writeFileSync(settingsPath, JSON.stringify(settings), 'utf8')

    const second = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(second.alreadyInstalled).toBe(false) // migration is a real write, not a no-op
    const migrated = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: { PreToolUse?: Array<{ hooks: Array<{ command: string }> }>; PostToolUse: Array<{ hooks: Array<{ command: string }> }> }
    }
    const stillUnderPre = (migrated.hooks.PreToolUse ?? []).some(e => e.hooks.some(h => h.command === command))
    expect(stillUnderPre).toBe(false)
    expect(migrated.hooks.PostToolUse.filter(e => e.hooks.some(h => h.command === command))).toHaveLength(1)

    // Running it a third time is now a true no-op.
    const third = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(third.alreadyInstalled).toBe(true)
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
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: { PreToolUse: Array<{ matcher: string }>; PostToolUse: Array<{ matcher: string }> }
    }
    // The unrelated pre-existing PreToolUse entry survives untouched...
    expect(settings.hooks.PreToolUse.some(e => e.matcher === 'Bash')).toBe(true)
    // ...and the render-substitution hook lands under PostToolUse, not
    // alongside it under PreToolUse.
    expect(settings.hooks.PreToolUse.some(e => e.matcher === 'Read')).toBe(false)
    expect(settings.hooks.PostToolUse.some(e => e.matcher === 'Read')).toBe(true)
  })

  it('reports whether "livestage" resolves on PATH after a successful install', () => {
    const result = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(result.success).toBe(true)
    expect(typeof result.pathVerified).toBe('boolean')
    if (!result.pathVerified) expect(result.message).toContain('not resolvable on PATH')
  })
})

// Transactional rollback (business rule 5): a failure partway through
// init's write sequence must leave the filesystem exactly as it was
// before init started, not a half-installed state.
describe('runInit rollback on partial failure', () => {
  let homeDir: string
  let projectDir: string

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'ls-init-rollback-home-'))
    projectDir = mkdtempSync(join(tmpdir(), 'ls-init-rollback-proj-'))
  })

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  })

  it('a malformed existing settings.json fails the whole init and rolls back the session-start hook file it had already written', () => {
    const settingsPath = join(homeDir, '.claude', 'settings.json')
    mkdirSync(join(homeDir, '.claude'), { recursive: true })
    writeFileSync(settingsPath, '{ not valid json', 'utf8')

    const result = runInit({ client: 'claude-code', homeDir, cwd: projectDir })

    expect(result.success).toBe(false)
    expect(result.message).toContain('rolled back')
    // The session-start hook file was written before the settings.json
    // write failed; it must not survive the rollback.
    expect(existsSync(join(homeDir, '.livestage', 'hooks', 'sessionStart.mjs'))).toBe(false)
    // The malformed settings.json is untouched, not partially overwritten.
    expect(readFileSync(settingsPath, 'utf8')).toBe('{ not valid json')
    // The project policy was never reached (settings.json failed first).
    expect(existsSync(join(projectDir, '.livestage', 'policy.json'))).toBe(false)
  })

  it('a pre-existing session-start hook file is restored to its original content on rollback, not deleted', () => {
    const settingsPath = join(homeDir, '.claude', 'settings.json')
    mkdirSync(join(homeDir, '.claude'), { recursive: true })
    writeFileSync(settingsPath, '{ not valid json', 'utf8')
    const hookPath = join(homeDir, '.livestage', 'hooks', 'sessionStart.mjs')
    mkdirSync(dirname(hookPath), { recursive: true })
    writeFileSync(hookPath, '// a pre-existing, unrelated file', 'utf8')

    runInit({ client: 'claude-code', homeDir, cwd: projectDir })

    // ensureSessionStartHookFile only overwrites when the file doesn't
    // already look like the real hook script, so this file (unrelated
    // content) DOES get overwritten and then must be rolled back to its
    // original content, not left as the new hook script or deleted.
    expect(readFileSync(hookPath, 'utf8')).toBe('// a pre-existing, unrelated file')
  })
})
