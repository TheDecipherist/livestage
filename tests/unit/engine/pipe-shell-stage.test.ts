import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execute } from '../../../src/engine/engine.js'
import { parse } from 'livestage/parser'

// Wave 2, feature 22 (Pipe): business rule 2 (non-built-in shell utilities
// in a pipe stage are stripped with a WARN on Windows, since the allowlist
// model does not translate) had zero implementation and zero coverage
// before this wave; process.platform was never checked anywhere in src/.
function render(source: string, allowPatterns: string[] = ['*']) {
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
  })
}

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

describe('pipe: non-built-in shell stage', () => {
  const originalPlatform = process.platform
  afterEach(() => setPlatform(originalPlatform))

  it('executes through the shell allowlist on a non-Windows platform', () => {
    setPlatform('linux')
    // A pipe with no @render sink inlines the scalar result (business rule
    // 3), space-joined, hence "a b c" rather than three lines.
    const result = render('@query "echo c; echo a; echo b" | sort /', ['echo*', 'sort*'])
    expect(result.errors).toHaveLength(0)
    expect(result.output.trim()).toBe('a b c')
  })

  it('is stripped with a WARN on Windows instead of executing', () => {
    setPlatform('win32')
    const result = render('@query "echo hi" | customutil /', ['*'])
    expect(result.warnings.some(w => w.includes('stripped') && w.includes('Windows'))).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('grep/sort/head/tail/uniq/wc are unaffected by the Windows check (cross-platform built-ins, no process spawn)', () => {
    // Uses @list (never spawns a process) rather than @query, since spoofing
    // process.platform also changes Node's own execSync shell-selection
    // behavior for a real spawned command, which would confound this case.
    let dir = ''
    try {
      dir = mkdtempSync(join(tmpdir(), 'ls-pipe-win-'))
      writeFileSync(join(dir, 'c.txt'), '')
      writeFileSync(join(dir, 'a.txt'), '')
      writeFileSync(join(dir, 'b.txt'), '')
      setPlatform('win32')
      const ast = parse('@list ./ match="*.txt" | sort /')
      const result = execute(ast, { ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
      expect(result.warnings.some(w => w.includes('stripped'))).toBe(false)
      expect(result.output.trim()).toBe('./a.txt ./b.txt ./c.txt')
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true })
    }
  })
})
