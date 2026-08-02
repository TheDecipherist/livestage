import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runRender } from '../../../src/cli/commands/render.js'
import { runValidate } from '../../../src/cli/commands/validate.js'
import { runParse } from '../../../src/cli/commands/parse.js'
import { runEval } from '../../../src/cli/commands/eval.js'
import { loadEnvFile } from '../../../src/cli/env-loader.js'

const TMP = join(tmpdir(), 'livestage-cli-validate-test')

beforeAll(() => { mkdirSync(TMP, { recursive: true }) })
afterAll(() => { rmSync(TMP, { recursive: true, force: true }) })

function write(name: string, content: string): string {
  const p = join(TMP, name)
  writeFileSync(p, content)
  return p
}

describe('runValidate', () => {
  it('validates a correct LiveStage document with exit 0', () => {
    const file = write('valid.md', '\n# Good document\n\nNo errors here.\n')
    const result = runValidate(file)
    expect(result.exitCode).toBe(0)
    expect(result.errors).toHaveLength(0)
  })

  it('reports error for missing @include file', () => {
    const file = write('include-bad.md', '\n@include ./nonexistent.md /\n')
    const result = runValidate(file)
    expect(result.exitCode).toBe(1)
    expect(result.errors.some(e => e.includes('@include'))).toBe(true)
  })

  it('reports error for undefined @call macro', () => {
    const file = write('call-bad.md', '\n@call undefined_macro /\n')
    const result = runValidate(file)
    expect(result.exitCode).toBe(1)
    expect(result.errors.some(e => e.includes('@call'))).toBe(true)
  })

  it('reports warning for @env without fallback', () => {
    const file = write('env-warn.md', '\n@env NO_FALLBACK_VAR_123 /\n')
    const result = runValidate(file)
    expect(result.warnings.some(w => w.includes('@env'))).toBe(true)
  })

  it('returns exit 1 for missing file', () => {
    const result = runValidate('/no/such/file.md')
    expect(result.exitCode).toBe(1)
  })

  // CR-3 (Stage Only): a retired donor directive is not silently ignored,
  // it fails validate as an unknown directive.
  it('reports error for a retired directive (@phase) as unknown', () => {
    const file = write('retired-phase.md', '@phase setup\nbody\n@phase-end\n')
    const result = runValidate(file)
    expect(result.exitCode).toBe(1)
    expect(result.errors.some(e => e.includes('@phase') && e.includes('unknown directive'))).toBe(true)
  })

  it('reports error for a retired directive (@db) as unknown', () => {
    const file = write('retired-db.md', '@db query="db.users.find()" /\n')
    const result = runValidate(file)
    expect(result.exitCode).toBe(1)
    expect(result.errors.some(e => e.includes('@db') && e.includes('unknown directive'))).toBe(true)
  })

  it('does not flag a leading unregistered marker line', () => {
    const file = write('marker-only.md', '@legacy-tool\n# Fine\n')
    const result = runValidate(file)
    expect(result.errors.some(e => e.includes('unknown directive'))).toBe(false)
  })
})

describe('runParse', () => {
  it('outputs valid JSON AST', () => {
    const file = write('parse.md', '\n# Hello\n')
    const result = runParse(file)
    expect(result.exitCode).toBe(0)
    const ast = JSON.parse(result.output) as { isLiveStage: boolean }
    expect(ast.isLiveStage).toBe(true)
  })

  it('pretty-prints when --pretty is set', () => {
    const file = write('parse-pretty.md', '\n# Hello\n')
    const result = runParse(file, { pretty: true })
    expect(result.output).toContain('\n')
  })

  it('filters to specific node type with --node', () => {
    const file = write('parse-node.md', '\n# Hello\n\n@env FOO fallback="bar" /\n')
    const result = runParse(file, { node: 'env' })
    const ast = JSON.parse(result.output) as { nodes: Array<{ type: string }> }
    expect(ast.nodes.every(n => n.type === 'env')).toBe(true)
  })

  it('returns exit 1 for missing file', () => {
    const result = runParse('/no/such/file.md')
    expect(result.exitCode).toBe(1)
  })
})

describe('runEval', () => {
  it('evaluates a true expression', () => {
    const result = runEval('1 + 1 === 2')
    expect(result.output).toBe('true')
    expect(result.exitCode).toBe(0)
  })

  it('evaluates a false expression', () => {
    const result = runEval('1 === 2')
    expect(result.output).toBe('false')
  })

  it('evaluates string concatenation', () => {
    const result = runEval('"hello" + " " + "world"')
    expect(result.output).toBe('hello world')
  })
})

describe('loadEnvFile', () => {
  it('parses key=value pairs', () => {
    const file = write('test.env', 'FOO=bar\nBAZ=qux\n')
    const env = loadEnvFile(file)
    expect(env['FOO']).toBe('bar')
    expect(env['BAZ']).toBe('qux')
  })

  it('strips surrounding quotes from values', () => {
    const file = write('quoted.env', 'FOO="hello world"\nBAR=\'single\'\n')
    const env = loadEnvFile(file)
    expect(env['FOO']).toBe('hello world')
    expect(env['BAR']).toBe('single')
  })

  it('ignores comments and blank lines', () => {
    const file = write('comments.env', '# comment\n\nFOO=bar\n')
    const env = loadEnvFile(file)
    expect(Object.keys(env)).toHaveLength(1)
    expect(env['FOO']).toBe('bar')
  })

  it('returns empty object for missing file', () => {
    const env = loadEnvFile('/no/such/file.env')
    expect(env).toEqual({})
  })
})

describe('ISSUE-002 — runRender loads security config and passes it to engine', () => {
  it('runRender accepts a securityConfig option that enables @query execution', () => {
    const file = write('query-shell.md', '@query "echo shellworks" label="out" /\n{{ out }}\n')
    const result = runRender(file, { securityConfig: { allowShell: true, allowHttp: false, allowDb: false, jailRoot: TMP } })
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('shellworks')
  })

  it('@query in rendered doc returns empty string when securityConfig has allowShell: false /', () => {
    const file = write('query-blocked.md', '@query "echo blocked" label="out" /\n{{ out }}\n')
    const result = runRender(file, { securityConfig: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: TMP } })
    expect(result.exitCode).toBe(0)
    expect(result.output.trim()).toBe('')
    expect(result.errors).toHaveLength(0)
  })

  it('@query in @define/@call is accessible to caller when securityConfig enables shell /', () => {
    const src = '@define q_macro\n@query "echo macroworks" label="result" /\n@define-end\n@call q_macro /\n{{ result }}\n'
    const file = write('macro-query.md', src)
    const result = runRender(file, { securityConfig: { allowShell: true, allowHttp: false, allowDb: false, jailRoot: TMP } })
    expect(result.exitCode).toBe(0)
    expect(result.output).toContain('macroworks')
  })
})
