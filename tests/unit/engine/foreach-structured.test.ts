import { describe, it, expect } from 'vitest'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

// @foreach over an array of objects, with per-field dotted access inside
// the body (class 3 composition work). Before this, splitItems always did
// String(item) on every array element, so an object array rendered as
// "[object Object]" and {{ item.field }} produced nothing.
describe('@foreach over structured data', () => {
  it('resolves item.field for each object in a bound array', () => {
    const src = `@set dead = {{ [{ symbol: "lex", file: "lexer.ts", kind: "function" }, { symbol: "ASTNodeBase", file: "types.ts", kind: "type" }] }} /
@foreach item in {{ dead }}
- {{ item.symbol }} in {{ item.file }} ({{ item.kind }})
@foreach-end`
    const result = execute(parse(src))
    expect(result.output).toBe(
      '- lex in lexer.ts (function)\n- ASTNodeBase in types.ts (type)'
    )
  })

  it('a dotted interpolation still works inside a backtick code span (pre-existing parser rule: {{ }} inside inline backticks is not evaluated, verbatim markdown)', () => {
    const src = `@set dead = {{ [{ symbol: "lex" }] }} /
@foreach item in {{ dead }}
- \`{{ item.symbol }}\` is shown literally, {{ item.symbol }} outside backticks resolves
@foreach-end`
    const result = execute(parse(src))
    expect(result.output).toBe('- `{{ item.symbol }}` is shown literally, lex outside backticks resolves')
  })

  it('missing fields render as empty, not throwing or dropping the iteration', () => {
    const src = `@set rows = {{ [{ a: "x" }, { a: "y" }] }} /
@foreach item in {{ rows }}
[{{ item.a }}|{{ item.b }}]
@foreach-end`
    const result = execute(parse(src))
    expect(result.output).toBe('[x|]\n[y|]')
  })

  it('a nested array field is itself reachable per-item', () => {
    const src = `@set docs = {{ [{ id: "a", tags: ["x", "y"] }] }} /
@foreach item in {{ docs }}
{{ item.id }}: {{ item.tags.length }} tags
@foreach-end`
    const result = execute(parse(src))
    expect(result.output).toBe('a: 2 tags')
  })

  it('where= filters items by a simple field predicate before iterating', () => {
    const src = `@set rows = {{ [{ kind: "type", n: "A" }, { kind: "function", n: "B" }, { kind: "type", n: "C" }] }} /
@foreach item in {{ rows }} where="kind == 'type'"
{{ item.n }}
@foreach-end`
    const result = execute(parse(src))
    expect(result.output).toBe('A\nC')
  })

  it('sort= orders items before iterating', () => {
    const src = `@set rows = {{ [{ n: 3 }, { n: 1 }, { n: 2 }] }} /
@foreach item in {{ rows }} sort="n"
{{ item.n }}
@foreach-end`
    const result = execute(parse(src))
    expect(result.output).toBe('1\n2\n3')
  })

  it('limit= truncates the iteration', () => {
    const src = `@set rows = {{ [{ n: 1 }, { n: 2 }, { n: 3 }] }} /
@foreach item in {{ rows }} limit="2"
{{ item.n }}
@foreach-end`
    const result = execute(parse(src))
    expect(result.output).toBe('1\n2')
  })

  it('existing loop variables and nesting are preserved for a structured outer loop', () => {
    const src = `@set groups = {{ [{ name: "g1", members: ["a", "b"] }] }} /
@foreach g in {{ groups }}
@foreach m in {{ g.members }}
{{ g.name }}/{{ m }}
@foreach-end
@foreach-end`
    const result = execute(parse(src))
    expect(result.output).toBe('g1/a\ng1/b')
  })

  it('a bare {{ item }} (no field) on an object item still renders (JSON, not "[object Object]")', () => {
    const src = `@set rows = {{ [{ a: 1 }] }} /
@foreach item in {{ rows }}
{{ item }}
@foreach-end`
    const result = execute(parse(src))
    expect(result.output).not.toContain('[object Object]')
    expect(result.output).toContain('"a"')
  })

  it('an embedded directive call\'s own where=/fields= are never misattributed as @foreach-level filters (regression: emptied every iteration of README.stage\'s own directive-reference loop)', () => {
    const dir = 'tests/fixtures/mdd-docs-where-regression'
    const src = `@foreach docid in @list "${dir}/*.md" where="primitives.length > 0" fields="id"
@if docid != "id"
{{ docid }}
@if-end
@foreach-end`
    const result = execute(parse(src), {
      ctx: {
        cwd: process.cwd(),
        docDir: process.cwd(),
        security: { allowShell: true, allowHttp: false, allowDb: false, jailRoot: process.cwd() },
      },
    })
    expect(result.output.trim()).toBe('has-primitives')
  })

  // Every existing (pre-structured) foreach shape stays exactly as before.
  describe('backward compatibility', () => {
    it('a comma-separated literal list still splits into scalar items', () => {
      const src = '@foreach c in red, green, blue\n- {{ c }}\n@foreach-end'
      const result = execute(parse(src))
      expect(result.output).toBe('- red\n- green\n- blue')
    })

    it('a scalar {{ }} binding still falls back to the legacy string form', () => {
      const src = '@set today = {{ "2026-08-17" }} /\n@foreach d in {{ today }}\n{{ d }}\n@foreach-end'
      const result = execute(parse(src))
      expect(result.output).toBe('2026-08-17')
    })
  })
})
