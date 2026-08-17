import { describe, it, expect } from 'vitest'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

// @render source=: the directive used on its own, not as a pipe sink (class
// 3 composition work). source= is a dotted label path, evaluated the same
// {{ }} expression sandbox every other directive already uses, so barrel
// object/array navigation ("dead.items", "dead.summary.byFile") works for
// free rather than needing its own lookup mechanism.
describe('@render source=', () => {
  it('renders a bound structured array as a table, columns derived from the first object\'s keys', () => {
    const src = `@set dead = {{ [{ symbol: "lex", file: "lexer.ts", kind: "function" }, { symbol: "ASTNodeBase", file: "types.ts", kind: "type" }] }} /
@render source="dead" type="table" /`
    const result = execute(parse(src))
    expect(result.errors).toHaveLength(0)
    expect(result.output).toContain('| symbol')
    expect(result.output).toContain('| lex')
    expect(result.output).toContain('| ASTNodeBase')
  })

  it('resolves a dotted path into a nested field, e.g. label.items', () => {
    // vm.runInNewContext (the expression sandbox every {{ }} goes through,
    // conditions.ts's runExpr) parses a top-level `{` as a block statement,
    // not an object literal, the same ambiguity that already applies to
    // any @set RHS; parenthesizing is the standard JS disambiguation, not
    // a quirk of this new @render work.
    const src = `@set r = {{ ({ count: 2, items: [{ n: "a" }, { n: "b" }] }) }} /
@render source="r.items" type="list" columns="n" /`
    const result = execute(parse(src))
    expect(result.output).toBe('- a\n- b')
  })

  it('type=json prints the raw resolved value directly, object or array alike', () => {
    const src = `@set r = {{ ({ count: 2, items: ["a", "b"] }) }} /
@render source="r" type="json" /`
    const result = execute(parse(src))
    expect(result.output).toContain('"count": 2')
    expect(result.output).toContain('"items"')
  })

  it('columns= controls both selection and order', () => {
    const src = `@set rows = {{ [{ a: 1, b: 2, c: 3 }] }} /
@render source="rows" type="table" columns="c,a" /`
    const result = execute(parse(src))
    const header = result.output.split('\n')[0]!
    expect(header.indexOf('c')).toBeLessThan(header.indexOf('a'))
    expect(header).not.toContain('b')
  })

  it('sort= orders rows before rendering', () => {
    const src = `@set rows = {{ [{ n: "b" }, { n: "a" }, { n: "c" }] }} /
@render source="rows" type="list" columns="n" sort="n" /`
    const result = execute(parse(src))
    expect(result.output).toBe('- a\n- b\n- c')
  })

  it('limit= truncates the rendered rows, and .length is still available to interpolate an "and N more"', () => {
    const src = `@set rows = {{ [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }] }} /
@render source="rows" type="list" columns="n" limit="2" /
and {{ rows.length - 2 }} more`
    const result = execute(parse(src))
    expect(result.output).toContain('- 1\n- 2')
    expect(result.output).not.toContain('- 3')
    expect(result.output).toContain('and 2 more')
  })

  // Fail-loud requirements, the brief's own words: "A silent empty render
  // is the worst outcome here."
  describe('fails loudly and specifically', () => {
    it('a source= naming a label that does not exist is a specific error, not an empty render', () => {
      const src = '@render source="doesNotExist" type="table" /'
      const result = execute(parse(src))
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.join(' ')).toContain('doesNotExist')
      expect(result.errors.join(' ')).toContain('does not name a value that exists')
    })

    it('a format needing an array against a scalar source= is a specific error naming the actual type', () => {
      const src = `@set n = {{ 42 }} /
@render source="n" type="table" /`
      const result = execute(parse(src))
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.join(' ')).toContain('needs an array')
      expect(result.errors.join(' ')).toContain('number')
    })

    it('@render with no source= and not in a pipe is a specific error', () => {
      const src = '@render type="table" /'
      const result = execute(parse(src))
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors.join(' ')).toContain('source=')
    })
  })

  it('the existing pipe-sink form is unchanged', () => {
    const src = `@list ./nonexistent match="*.md" | @render type="list" /`
    const result = execute(parse(src), { ctx: { docDir: process.cwd(), security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: process.cwd() } } })
    expect(result.errors).toHaveLength(0)
  })
})
