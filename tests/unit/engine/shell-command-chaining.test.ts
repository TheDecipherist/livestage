import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

// B1 (bug/shell-command-chaining, 2026-08-17): checkShellCommand's allow-
// pattern matching (matchShellPattern in security/rules.ts) converts a
// wildcard allow pattern like "echo *" into the fully-anchored regex
// /^echo .*$/, and .* matches shell metacharacters (;, &&, ||, |,
// backticks, $()) the same as any other character. A resolved command
// string containing an injected chained command therefore passes the
// check as part of an allowed match, and the caller (executeQuery,
// executeTest/executeCheck, runShell) then hands that same string to a
// real shell (spawnSync/execSync with shell:true), which DOES interpret
// those characters as command separators. Reachable two ways: ordinary
// {{ }} interpolation (interpolatePathSoft resolves it into command=
// before the allowlist check runs) and macro substitution (macros.ts's
// subStr splices a @foreach-bound value into command= as plain text,
// same problem). Fix: a dedicated interpolateShellSafe (engine-include.ts)
// and subStrShellSafe (macros.ts) shell-quote the substituted value
// before splicing, so an injected value becomes an inert literal
// argument -- the allowlist still permits exactly the same commands it
// always did, but nothing after the quoted boundary can execute.
//
// Marker-file technique: an injected payload tries to `touch` a marker
// file. Pre-fix, the marker file gets created (proving the chain ran).
// Post-fix, it must never appear, AND the base command's own output must
// still contain the injected text as a literal, inert argument (proving
// the fix is shell-quoting, not silently dropping the value).
describe('shell command allowlist does not permit command chaining after an allowed prefix', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-shell-chain-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(content: string, allowPatterns: string[]) {
    const filePath = join(dir, 'main.stage')
    const ast = parse(content, { filePath })
    return execute(ast, {
      filePath,
      ctx: {
        cwd: dir,
        security: {
          allowShell: true, allowHttp: false, allowDb: false, jailRoot: dir,
          shellConfig: {
            enabled: true,
            allow_patterns: allowPatterns,
            deny_patterns: [],
            allow_network: false,
            require_confirmation: false,
            audit_log: false,
          },
        },
      },
    })
  }

  const marker = (name: string) => join(dir, name)

  it('ordinary {{ }} interpolation into @query command= cannot chain a further command (executeQuery)', () => {
    writeFileSync(join(dir, 'payload.txt'), 'hi; touch MARKER_QUERY.txt')
    const result = render(
      '@read "payload.txt" label="x" visible="false" /\n@query "echo {{ x }}" label="out" /\n<<{{ out }}>>\n',
      ['echo *'],
    )
    expect(existsSync(marker('MARKER_QUERY.txt'))).toBe(false)
    // The injected text still shows up, as an inert literal argument to
    // echo, proving the fix is quoting, not dropping the value.
    expect(result.output).toContain('hi; touch MARKER_QUERY.txt')
  })

  it('ordinary {{ }} interpolation into @test command= cannot chain a further command (executeTest)', () => {
    writeFileSync(join(dir, 'payload.txt'), 'hi; touch MARKER_TEST.txt')
    const result = render(
      '@read "payload.txt" label="x" visible="false" /\n@test command="echo {{ x }}" label="t" /\n<<{{ t }}>>\n',
      ['echo *'],
    )
    expect(existsSync(marker('MARKER_TEST.txt'))).toBe(false)
    expect(result.output).toContain('hi; touch MARKER_TEST.txt')
  })

  it('ordinary {{ }} interpolation into @check command= cannot chain a further command (executeCheck)', () => {
    writeFileSync(join(dir, 'payload.txt'), 'hi; touch MARKER_CHECK.txt')
    const result = render(
      '@read "payload.txt" label="x" visible="false" /\n@check command="echo {{ x }}" label="c" /\n<<{{ c }}>>\n',
      ['echo *'],
    )
    expect(existsSync(marker('MARKER_CHECK.txt'))).toBe(false)
    expect(result.output).toContain('hi; touch MARKER_CHECK.txt')
  })

  it('a @foreach-bound value substituted into @query command= cannot chain a further command (macros.ts)', () => {
    writeFileSync(join(dir, 'evil.md'), 'hi; touch MARKER_FOREACH_QUERY.txt')
    const result = render(
      '@foreach x in @read "evil.md"\n@query "echo {{ x }}" label="out" /\n<<{{ out }}>>\n@foreach-end\n',
      ['echo *'],
    )
    expect(existsSync(marker('MARKER_FOREACH_QUERY.txt'))).toBe(false)
    expect(result.output).toContain('hi; touch MARKER_FOREACH_QUERY.txt')
  })

  it('a @foreach-bound value substituted into @test command= cannot chain a further command (macros.ts)', () => {
    writeFileSync(join(dir, 'evil.md'), 'hi; touch MARKER_FOREACH_TEST.txt')
    const result = render(
      '@foreach x in @read "evil.md"\n@test command="echo {{ x }}" label="t" /\n<<{{ t }}>>\n@foreach-end\n',
      ['echo *'],
    )
    expect(existsSync(marker('MARKER_FOREACH_TEST.txt'))).toBe(false)
    expect(result.output).toContain('hi; touch MARKER_FOREACH_TEST.txt')
  })

  it('a @foreach-bound value substituted into a pipe shell stage command cannot chain a further command (runShell)', () => {
    writeFileSync(join(dir, 'evil.md'), 'payload.txt; touch MARKER_PIPE.txt')
    writeFileSync(join(dir, 'payload.txt'), 'irrelevant')
    render(
      '@foreach x in @read "evil.md"\n@query "echo hi" | cat {{ x }} /\n@foreach-end\n',
      ['echo *', 'cat *'],
    )
    expect(existsSync(marker('MARKER_PIPE.txt'))).toBe(false)
  })

  it('a value containing an embedded single quote is still shell-quoted safely (no escape, no injection)', () => {
    writeFileSync(join(dir, 'payload.txt'), "it's fine; touch MARKER_QUOTE.txt")
    const result = render(
      '@read "payload.txt" label="x" visible="false" /\n@query "echo {{ x }}" label="out" /\n<<{{ out }}>>\n',
      ['echo *'],
    )
    expect(existsSync(marker('MARKER_QUOTE.txt'))).toBe(false)
    expect(result.output).toContain("it's fine; touch MARKER_QUOTE.txt")
  })

  it('legitimate @query interpolation with a benign multi-word value still works end to end', () => {
    const result = render(
      '@set greeting = "hello world" /\n@query "echo {{ greeting }}" label="out" /\n<<{{ out }}>>\n',
      ['echo *'],
    )
    expect(result.output).toContain('<<hello world>>')
  })

  it('legitimate @test/@check with a benign command= still runs and reports its real exit code', () => {
    const result = render('@test command="true" label=t /\nexit={{ t_exit }}\n', ['true'])
    expect(result.output).toContain('exit=0')
  })
})
