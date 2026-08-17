import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'
import type { EngineContext } from '../../../src/engine/context.js'

function granted(languages: string[]): EngineContext['security'] {
  return {
    allowShell: true, allowHttp: false, allowDb: false, jailRoot: process.cwd(),
    codeConfig: { languages, timeout: 30_000, runners: {} },
  }
}

// @code parse= (class 3 composition work, Part 2): a script's stdout can
// declare its own shape instead of only being auto-detected as JSON or
// silently treated as an opaque string.
describe('@code parse=', () => {
  it('parse="text" binds stdout verbatim, {{ label }} interpolation works, no parse attempted', () => {
    const src = '@code language="javascript" label="r" parse="text"\nconsole.log("not json {{{")\n@code-end\n{{ r }}'
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('not json {{{')
  })

  it('parse="json" requires valid JSON and fails the directive with the parse error, not a silent degrade', () => {
    const src = '@code language="javascript" label="r" parse="json"\nconsole.log("not json")\n@code-end'
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.join(' ')).toContain('parse="json"')
    expect(result.errors.join(' ')).toContain('not valid JSON')
  })

  it('parse="json" binds a top-level JSON ARRAY too (the legacy no-parse= auto-detect only merges objects)', () => {
    const src = '@code language="javascript" label="r" parse="json"\nconsole.log(JSON.stringify([1,2,3]))\n@code-end\n{{ r.length }}'
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('3')
  })

  it('parse="csv" binds an array of row objects, ready for @render type="table"', () => {
    const src = `@code language="javascript" label="rows" parse="csv"
console.log("symbol,kind")
console.log("lex,function")
console.log("ASTNodeBase,type")
@code-end
@render source="rows" type="table" /`
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('| symbol')
    expect(result.output).toContain('| lex')
  })

  it('coerce="numbers" on a parse="csv" result produces real numbers, not strings', () => {
    const src = `@code language="javascript" label="rows" parse="csv" coerce="numbers"
console.log("n")
console.log("42")
@code-end
{{ rows[0].n + 1 }}`
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('43')
  })

  it('parse="lines" binds one string per line', () => {
    const src = '@code language="javascript" label="r" parse="lines"\nconsole.log("a")\nconsole.log("b")\n@code-end\n{{ r.length }}'
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('2')
  })

  it('no parse= keeps the existing auto-detect behavior unchanged', () => {
    const src = '@code language="javascript" label="r"\nconsole.log(JSON.stringify({total: 42}))\n@code-end\n{{ r.total }}'
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('42')
  })

  it('an unrecognized parse= value fails loudly, naming the bad value', () => {
    const src = '@code language="javascript" label="r" parse="html"\nconsole.log("x")\n@code-end'
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.join(' ')).toContain('parse="html"')
  })

  it('the branch taken is recorded and inspectable: label_parse names the explicit format, or which side of auto-detect ran', () => {
    const explicit = execute(parse('@code language="javascript" label="r" parse="text"\nconsole.log("x")\n@code-end'), { ctx: { security: granted(['javascript']) } })
    expect(explicit.envFiles['r_parse']).toBe('text')

    const autoJson = execute(parse('@code language="javascript" label="r"\nconsole.log(JSON.stringify({a:1}))\n@code-end'), { ctx: { security: granted(['javascript']) } })
    expect(autoJson.envFiles['r_parse']).toBe('auto-json-object')

    const autoText = execute(parse('@code language="javascript" label="r"\nconsole.log("plain")\n@code-end'), { ctx: { security: granted(['javascript']) } })
    expect(autoText.envFiles['r_parse']).toBe('auto-text')
  })

  // The brief's own negative-test requirement: dotted access on a text
  // result must fail loudly, naming the label, what it actually is, and
  // what parse= would have been needed.
  describe('dotted access on a parse="text" result is an error, not an empty render', () => {
    it('fails with a message naming the label, what it actually is, and what parse= would fix it', () => {
      const src = '@code language="javascript" label="r" parse="text"\nconsole.log("plain text")\n@code-end\n{{ r.field }}'
      const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
      // A ReferenceError-shaped failure here would be silently suppressed
      // (evalExpr's existing convention); dotted access on a STRING is not
      // a ReferenceError, `r` resolves fine, `.field` on a string is just
      // `undefined` in plain JS, so this needs its own explicit check.
      const combined = result.warnings.join(' ') + result.errors.join(' ')
      expect(combined).toContain('r.field')
      expect(combined).toContain('plain string')
      expect(combined).toContain('parse=')
    })
  })

  it('parse="xml" binds a nested object, usable with @foreach/@render like any other structured result', () => {
    const src = `@code language="javascript" label="doc" parse="xml" visible="false"
console.log('<result><item>a</item><item>b</item></result>')
@code-end
@foreach item in {{ doc.result.item }}
- {{ item }}
@foreach-end`
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.output).toBe('- a\n- b')
  })

  it('parse="yaml" binds flat top-level fields', () => {
    const src = `@code language="javascript" label="cfg" parse="yaml"
console.log("count: 3")
console.log("name: dead-exports")
@code-end
{{ cfg.name }} has {{ cfg.count }}`
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.output).toContain('dead-exports has 3')
  })
})

describe('@code schema=', () => {
  let dir: string
  function withSchemaFile(fields: Record<string, unknown>): string {
    dir = mkdtempSync(join(tmpdir(), 'ls-code-schema-'))
    writeFileSync(join(dir, 'result.schema.json'), JSON.stringify({ fields }))
    return dir
  }

  it('a structured result matching the schema binds normally, no error', () => {
    const testDir = withSchemaFile({ symbol: { type: 'string', required: true }, count: { type: 'number' } })
    try {
      const src = `@code language="javascript" label="r" schema="result.schema.json"
console.log(JSON.stringify({ symbol: "lex", count: 1 }))
@code-end
{{ r.symbol }}`
      const result = execute(parse(src), { ctx: { docDir: testDir, cwd: testDir, security: granted(['javascript']) } })
      expect(result.errors).toHaveLength(0)
      expect(result.output).toContain('lex')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a result that violates the schema fails the directive with a specific error, not a plausible-looking render', () => {
    const testDir = withSchemaFile({ count: { type: 'number' } })
    try {
      const src = `@code language="javascript" label="r" schema="result.schema.json"
console.log(JSON.stringify({ count: "not a number" }))
@code-end`
      const result = execute(parse(src), { ctx: { docDir: testDir, cwd: testDir, security: granted(['javascript']) } })
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.join(' ')).toContain('count')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a required field missing from the result fails validation', () => {
    const testDir = withSchemaFile({ symbol: { type: 'string', required: true } })
    try {
      const src = `@code language="javascript" label="r" schema="result.schema.json"
console.log(JSON.stringify({ other: 1 }))
@code-end`
      const result = execute(parse(src), { ctx: { docDir: testDir, cwd: testDir, security: granted(['javascript']) } })
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.join(' ')).toContain('symbol')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('every row of a parse="csv" array is validated against the schema', () => {
    const testDir = withSchemaFile({ n: { type: 'number' } })
    try {
      const src = `@code language="javascript" label="rows" parse="csv" schema="result.schema.json"
console.log("n")
console.log("not-a-number")
@code-end`
      const result = execute(parse(src), { ctx: { docDir: testDir, cwd: testDir, security: granted(['javascript']) } })
      expect(result.errors.length).toBeGreaterThan(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('without schema=, behavior is unchanged', () => {
    const src = '@code language="javascript" label="r"\nconsole.log(JSON.stringify({ anything: "goes" }))\n@code-end\n{{ r.anything }}'
    const result = execute(parse(src), { ctx: { security: granted(['javascript']) } })
    expect(result.errors).toHaveLength(0)
    expect(result.output).toContain('goes')
  })
})
