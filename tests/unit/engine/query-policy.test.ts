import { describe, it, expect } from 'vitest'
import { execute } from '../../../src/engine/engine.js'
import { parse } from 'livestage/parser'

function render(source: string, allowPatterns: string[] = []): string {
  const ast = parse(source)
  return execute(ast, {
    ctx: {
      security: {
        allowShell: true,
        allowHttp: false,
        allowDb: false,
        jailRoot: process.cwd(),
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
  }).output
}

describe('@query goes through checkShellCommand, not just the allowShell flag', () => {
  it('runs and captures output when the command matches an allow_patterns entry', () => {
    const out = render('@query "echo hello" label="out" /\n<<{{ out }}>>', ['echo *'])
    expect(out).toContain('<<hello>>')
  })

  it('is blocked when the command is not in allow_patterns, even with allowShell true', () => {
    const out = render('@query "echo hello" label="out" /\n<<{{ out }}>>', [])
    expect(out).toContain('<<>>')
  })

  it('an immutable always_block command is refused even when allow_patterns tries to grant it', () => {
    const out = render('@query "rm -rf /tmp/whatever" label="out" /\n<<{{ out }}>>', ['rm -rf *'])
    expect(out).toContain('<<>>')
  })
})
