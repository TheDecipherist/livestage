import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync, execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runInit } from '../../src/cli/commands/init.js'

// Blocker fix (see doc 11's known_issues): the render-substitution hook was
// registered under the wrong settings.json key (PreToolUse instead of
// PostToolUse). tests/unit/hook/pretooluse.test.ts calls handlePostToolUse()
// directly, which exercises the render logic but never the actual dispatch
// path Claude Code uses: piping a JSON payload to the built script's stdin
// and reading its stdout. A wrong registration key would never fail that
// unit test (the function itself was always correct), which is exactly how
// the bug shipped undetected. This test goes through real dispatch instead:
// build the CLI, spawn the real dist/hook/pretooluse.js as a child process
// with the same stdin shape Claude Code sends, and assert stdout is the
// rendered document, not `{}` (the fail-open no-op shape).
const repoRoot = join(import.meta.dirname, '..', '..')
let hookPath: string
let workDir: string

beforeAll(() => {
  execSync('npm run build', { cwd: repoRoot, stdio: 'pipe' })
  hookPath = join(repoRoot, 'dist', 'hook', 'pretooluse.js')
  expect(existsSync(hookPath), 'dist/hook/pretooluse.js must exist after npm run build').toBe(true)
  workDir = mkdtempSync(join(tmpdir(), 'ls-hook-dispatch-'))
}, 60_000)

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true })
})

function runHook(script: string, payload: unknown): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('node', [script], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
    })
    return { stdout, status: 0 }
  } catch (err) {
    const e = err as { stdout?: string; status?: number }
    return { stdout: e.stdout ?? '', status: e.status ?? 1 }
  }
}

describe('render-substitution hook: real dispatch, not a direct function call', () => {
  it('a realistic PostToolUse-shaped Read payload produces the render on stdout, not {}', () => {
    const file = join(workDir, 'doc.stage')
    writeFileSync(file, '# Dispatch check\n\nStatic content.\n')

    // The stdin shape Claude Code actually sends for a PostToolUse event on
    // a Read tool call: tool_name, tool_input.file_path, and the original
    // tool_output the hook may substitute.
    const payload = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: file },
      tool_output: { content: '@directive-syntax-would-still-be-here', isError: false },
    }
    const result = runHook(hookPath, payload)
    expect(result.status).toBe(0)
    const output = JSON.parse(result.stdout) as {
      hookSpecificOutput?: { hookEventName: string; updatedToolOutput: { content: string; isError: boolean } }
    }
    // The regression this guards: a hook registered under the wrong
    // settings.json key still runs fine when invoked directly (it doesn't
    // know or care what key it's registered under), so only asserting
    // "this JSON shape came back correctly formed" catches the actual
    // failure mode; a wrong registration key is a settings.json problem,
    // proven separately by the init.test.ts invariant test.
    expect(output.hookSpecificOutput?.hookEventName).toBe('PostToolUse')
    expect(output.hookSpecificOutput?.updatedToolOutput.content).toContain('Static content.')
    expect(output.hookSpecificOutput?.updatedToolOutput.content).not.toContain('@directive-syntax-would-still-be-here')
  })

  it('a non-.stage Read payload dispatches to {} (no substitution), the documented fail-open shape', () => {
    const file = join(workDir, 'doc.md')
    writeFileSync(file, '# Not a stage file\n')
    const payload = {
      hook_event_name: 'PostToolUse',
      tool_name: 'Read',
      tool_input: { file_path: file },
      tool_output: { content: '# Not a stage file\n', isError: false },
    }
    const result = runHook(hookPath, payload)
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({})
  })
})

describe('SessionStart hook: real dispatch through the installed script', () => {
  let homeDir: string
  let projectDir: string
  let sessionStartHookPath: string
  let binDir: string
  let env: NodeJS.ProcessEnv

  beforeAll(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'ls-session-home-'))
    projectDir = mkdtempSync(join(tmpdir(), 'ls-session-proj-'))
    const result = runInit({ client: 'claude-code', homeDir, cwd: projectDir })
    expect(result.success).toBe(true)
    sessionStartHookPath = join(homeDir, '.livestage', 'hooks', 'sessionStart.mjs')
    expect(existsSync(sessionStartHookPath)).toBe(true)

    // The installed hook script shells out to the `livestage` binary by
    // name (spawnSync('livestage', ...)), not a direct import of the CLI's
    // built entry point - real dispatch means giving it a real "livestage"
    // resolvable on PATH, the same as a real install would, rather than
    // reaching into dist/cli/cli.js from the test.
    binDir = mkdtempSync(join(tmpdir(), 'ls-session-bin-'))
    const shimPath = join(binDir, 'livestage')
    writeFileSync(shimPath, `#!/usr/bin/env node\nimport(${JSON.stringify('file://' + join(repoRoot, 'dist', 'cli', 'cli.js'))})\n`)
    chmodSync(shimPath, 0o755)
    env = { ...process.env, PATH: `${binDir}:${process.env['PATH'] ?? ''}` }
  })

  afterAll(() => {
    rmSync(homeDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
    rmSync(binDir, { recursive: true, force: true })
  })

  it('injects the rendered CLAUDE-LiveStage.stage content via additionalContext, real dispatch', () => {
    writeFileSync(join(projectDir, 'CLAUDE-LiveStage.stage'), '# Brief\n\nSession-start content.\n')
    const result = execFileSync('node', [sessionStartHookPath], {
      input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: projectDir, source: 'startup' }),
      encoding: 'utf8',
      env,
    })
    const output = JSON.parse(result) as {
      hookSpecificOutput?: { hookEventName: string; additionalContext: string }
    }
    expect(output.hookSpecificOutput?.hookEventName).toBe('SessionStart')
    expect(output.hookSpecificOutput?.additionalContext).toContain('Session-start content.')
  })

  it('no-ops (exit 0, no stdout) when CLAUDE-LiveStage.stage does not exist', () => {
    const emptyProjectDir = mkdtempSync(join(tmpdir(), 'ls-session-empty-'))
    try {
      const result = execFileSync('node', [sessionStartHookPath], {
        input: JSON.stringify({ hook_event_name: 'SessionStart', cwd: emptyProjectDir, source: 'startup' }),
        encoding: 'utf8',
        env,
      })
      expect(result.trim()).toBe('')
    } finally {
      rmSync(emptyProjectDir, { recursive: true, force: true })
    }
  })
})
