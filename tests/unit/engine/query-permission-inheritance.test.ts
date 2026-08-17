import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execute } from '../../../src/engine/engine.js'
import { parse } from 'livestage/parser'

// End-to-end proof that shell.inherit_claude_permissions actually reaches
// @query's real execution path (sources.ts's executeQuery), not just the
// standalone checkShellCommandWithSettings unit tests
// (security-claude-settings.test.ts). Defaults off (see
// ShellSecurityConfig's own comment on the field: this repo's own
// .claude/settings.json narrows Bash to a handful of git/node patterns,
// so turning this on unconditionally would have silently broken every
// existing @query test using `echo`), opt-in per project via policy.json.
describe('@query with shell.inherit_claude_permissions: true', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'ls-query-inherit-'))
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  function render(source: string, allowPatterns: string[]): string {
    const ast = parse(source)
    return execute(ast, {
      ctx: {
        cwd,
        security: {
          allowShell: true,
          allowHttp: false,
          allowDb: false,
          jailRoot: cwd,
          shellConfig: {
            enabled: true,
            allow_patterns: allowPatterns,
            deny_patterns: [],
            allow_network: false,
            require_confirmation: false,
            audit_log: false,
            inherit_claude_permissions: true,
          },
        },
      },
    }).output
  }

  function writeProjectSettings(permissions: Record<string, string[]>): void {
    mkdirSync(join(cwd, '.claude'), { recursive: true })
    writeFileSync(join(cwd, '.claude', 'settings.json'), JSON.stringify({ permissions }), 'utf8')
  }

  it('with no .claude/settings.json at all, behaves exactly like inherit off (no narrowing)', () => {
    const out = render('@query "echo hello" label="out" /\n<<{{ out }}>>', ['echo *'])
    expect(out).toContain('<<hello>>')
  })

  it('a project settings.json deny blocks a command livestage policy alone would allow', () => {
    writeProjectSettings({ deny: ['Bash(echo *)'] })
    const out = render('@query "echo hello" label="out" /\n<<{{ out }}>>', ['echo *'])
    expect(out).toContain('<<>>')
    expect(out).not.toContain('hello')
  })

  it('a project settings.json with unrelated Bash allow rules narrows away an uncovered livestage-allowed command', () => {
    // Mirrors this repo's own real .claude/settings.json shape: a few
    // specific git patterns, nothing about echo.
    writeProjectSettings({ allow: ['Bash(git status)'] })
    const out = render('@query "echo hello" label="out" /\n<<{{ out }}>>', ['echo *'])
    expect(out).toContain('<<>>')
  })

  it('a project settings.json allow rule that DOES cover the command lets it through', () => {
    writeProjectSettings({ allow: ['Bash(echo *)'] })
    const out = render('@query "echo hello" label="out" /\n<<{{ out }}>>', ['echo *'])
    expect(out).toContain('<<hello>>')
  })
})
