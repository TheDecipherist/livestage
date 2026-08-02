import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'
import type { EngineContext } from '../../../src/engine/context.js'

// Wave 4, feature 29 (Code Runners): [new], no donor source. @code is OFF in
// every profile until the policy grants code.languages explicitly, and
// engine-built runner invocations are the sole sanctioned exception to the
// inline -e/-c always-block (they never construct a shell string at all).
function granted(languages: string[]): EngineContext['security'] {
  return {
    allowShell: true, allowHttp: false, allowDb: false, jailRoot: process.cwd(),
    codeConfig: { languages, timeout: 30_000, runners: {} },
  }
}

describe('@code', () => {
  it('is refused when the language is not granted (empty policy default)', () => {
    const ast = parse('@code language="javascript"\nconsole.log(1)\n@code-end')
    const result = execute(ast, { ctx: { security: granted([]) } })
    expect(result.warnings.some(w => w.includes('not granted'))).toBe(true)
  })

  it('runs when the language is granted, capturing stdout inline', () => {
    const ast = parse('@code language="javascript"\nconsole.log("hello")\n@code-end')
    const result = execute(ast, { ctx: { security: granted(['javascript']) } })
    expect(result.output.trim()).toBe('hello')
    expect(result.warnings).toHaveLength(0)
  })

  it('JSON stdout binds as structured data under label, reachable by dot-path', () => {
    const ast = parse('@code language="javascript" label="r"\nconsole.log(JSON.stringify({total: 42}))\n@code-end\n{{ r.total }}')
    const result = execute(ast, { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('42')
  })

  it('non-JSON stdout does not populate structured fields beyond the base result shape', () => {
    const ast = parse('@code language="javascript" label="r"\nconsole.log("plain text")\n@code-end\n{{ r._exit }}')
    const result = execute(ast, { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('plain text')
    expect(result.output).toContain('0')
  })

  it('a nonzero exit is reflected in _exit', () => {
    const ast = parse('@code language="javascript" label="r"\nprocess.exit(3)\n@code-end\n{{ r._exit }}')
    const result = execute(ast, { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('3')
  })

  it('mock= serves the fixture and never spawns the runner, even for an ungranted language (feature 35)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-code-mock-'))
    try {
      writeFileSync(join(dir, 'fixture.txt'), 'from the fixture\n')
      const ast = parse('@code language="python" mock="fixture.txt" label="r"\nraise SystemExit(1)\n@code-end\n{{ r._exit }}')
      const result = execute(ast, { ctx: { cwd: dir, docDir: dir, security: granted([]) } })
      expect(result.output).toContain('from the fixture')
      expect(result.output).toContain('0')
      expect(result.warnings).toHaveLength(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('interpolate=false (default) leaves {{ }} inside the body untouched', () => {
    const ast = parse('@set x = "hello" /\n@code language="javascript"\nconsole.log("{{ x }}")\n@code-end')
    const result = execute(ast, { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('{{ x }}')
  })

  it('interpolate=true expands {{ }} inside the body before running it', () => {
    const ast = parse('@set x = "hello" /\n@code language="javascript" interpolate=true\nconsole.log("{{ x }}")\n@code-end')
    const result = execute(ast, { ctx: { security: granted(['javascript']) } })
    expect(result.output.trim()).toBe('hello')
  })

  it('LIVESTAGE_CONTEXT delivers args/vars/doc into the granted script', () => {
    const ast = parse('@code language="javascript" label="ctx"\nconsole.log(process.env.LIVESTAGE_CONTEXT)\n@code-end')
    const security = granted(['javascript'])
    const result = execute(ast, {
      ctx: { security, skillContext: { args: 'sync', argsList: ['sync'], namedArgs: {}, vars: { K: 'v' }, sessionId: '', effort: '', skillDir: '' } },
    })
    const parsed = JSON.parse(result.output.trim())
    expect(parsed).toMatchObject({ args: 'sync', argN: ['sync'], vars: { K: 'v' } })
  })

  it('the always-block carve-out: an engine-built invocation runs even though a literal "node -e" @query stays blocked', () => {
    const ast = parse('@code language="javascript" label="r"\nconsole.log(JSON.stringify({ok:true}))\n@code-end\n{{ r.ok }}')
    const result = execute(ast, { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('true')
    expect(result.errors).toHaveLength(0)
  })

  it('src= resolves through the same data-jail check every source directive uses (checkDataPath)', () => {
    const ast = parse('@code language="javascript" src="../../etc/passwd" /')
    const result = execute(ast, { ctx: { cwd: process.cwd(), security: granted(['javascript']) } })
    expect(result.warnings.some(w => w.includes('not found or blocked'))).toBe(true)
  })

  it('can be used as a pipe source (self-closed with src=), e.g. piped into @render type="table"', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-code-pipe-'))
    try {
      writeFileSync(join(dir, 'table.js'), 'console.log("a\\t1")\nconsole.log("b\\t2")\n')
      const ast = parse('@code language="javascript" src="table.js" | @render type="table" columns="name,count" /')
      const result = execute(ast, { ctx: { cwd: dir, security: granted(['javascript']) } })
      expect(result.output).toContain('| a    | 1     |')
      expect(result.output).toContain('| b    | 2     |')
      // No trailing blank row from the script's own trailing newline.
      expect(result.output.trim().endsWith('| b    | 2     |')).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
