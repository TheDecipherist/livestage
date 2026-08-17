import { describe, it, expect } from 'vitest'
import { parseCodeOutput, parseCoerceSpec, isParseFormat } from '../../../src/engine/parse-formats.js'

const noCoerce = parseCoerceSpec(undefined)

describe('parse-formats', () => {
  describe('isParseFormat', () => {
    it('accepts every documented format', () => {
      for (const f of ['text', 'json', 'ndjson', 'csv', 'tsv', 'xml', 'yaml', 'lines']) {
        expect(isParseFormat(f)).toBe(true)
      }
    })
    it('rejects an unknown format', () => {
      expect(isParseFormat('html')).toBe(false)
    })
  })

  describe('text', () => {
    it('binds stdout verbatim, no parse attempted at all', () => {
      expect(parseCodeOutput('not json at all {{{', 'text', noCoerce)).toBe('not json at all {{{')
    })
  })

  describe('json', () => {
    it('parses a valid JSON object', () => {
      expect(parseCodeOutput('{"a":1}', 'json', noCoerce)).toEqual({ a: 1 })
    })

    it('parses a valid JSON array (unlike the legacy auto-detect path, which only merges objects)', () => {
      expect(parseCodeOutput('[1,2,3]', 'json', noCoerce)).toEqual([1, 2, 3])
    })

    it('throws with a specific message on invalid JSON, does not silently degrade', () => {
      expect(() => parseCodeOutput('not json', 'json', noCoerce)).toThrow(/parse="json".*not valid JSON/)
    })
  })

  describe('ndjson', () => {
    it('parses one object per non-empty line', () => {
      const out = parseCodeOutput('{"a":1}\n{"a":2}\n', 'ndjson', noCoerce)
      expect(out).toEqual([{ a: 1 }, { a: 2 }])
    })

    it('a malformed line throws naming the line number', () => {
      expect(() => parseCodeOutput('{"a":1}\nnot json\n', 'ndjson', noCoerce)).toThrow(/line 2/)
    })
  })

  describe('lines', () => {
    it('splits stdout into one string per line', () => {
      expect(parseCodeOutput('a\nb\nc', 'lines', noCoerce)).toEqual(['a', 'b', 'c'])
    })

    it('drops exactly one trailing empty line (the runner\'s own newline), keeps interior blanks', () => {
      expect(parseCodeOutput('a\n\nb\n', 'lines', noCoerce)).toEqual(['a', '', 'b'])
    })

    it('empty stdout is an empty array', () => {
      expect(parseCodeOutput('', 'lines', noCoerce)).toEqual([])
    })
  })

  describe('csv', () => {
    const csv = 'symbol,kind\nlex,function\nASTNodeBase,type\n'

    it('parses header + rows into an array of objects, every value a string by default', () => {
      const out = parseCodeOutput(csv, 'csv', noCoerce) as Record<string, unknown>[]
      expect(out).toEqual([
        { symbol: 'lex', kind: 'function' },
        { symbol: 'ASTNodeBase', kind: 'type' },
      ])
      expect(typeof out[0]!['symbol']).toBe('string')
    })

    it('handles a quoted cell containing the delimiter', () => {
      const out = parseCodeOutput('a,b\n"x,y",z\n', 'csv', noCoerce) as Record<string, unknown>[]
      expect(out[0]).toEqual({ a: 'x,y', b: 'z' })
    })

    it('coerce="numbers" converts numeric-looking cells to real numbers', () => {
      const out = parseCodeOutput('n\n42\n', 'csv', parseCoerceSpec('numbers')) as Record<string, unknown>[]
      expect(out[0]!['n']).toBe(42)
      expect(typeof out[0]!['n']).toBe('number')
    })

    it('coerce="booleans" converts true/false cells to real booleans', () => {
      const out = parseCodeOutput('flag\ntrue\n', 'csv', parseCoerceSpec('booleans')) as Record<string, unknown>[]
      expect(out[0]!['flag']).toBe(true)
    })

    it('with no coerce=, a numeric-looking cell stays a string (the documented default)', () => {
      const out = parseCodeOutput('n\n007\n', 'csv', noCoerce) as Record<string, unknown>[]
      expect(out[0]!['n']).toBe('007')
    })
  })

  describe('tsv', () => {
    it('parses tab-delimited header + rows', () => {
      const out = parseCodeOutput('symbol\tkind\nlex\tfunction\n', 'tsv', noCoerce)
      expect(out).toEqual([{ symbol: 'lex', kind: 'function' }])
    })
  })

  describe('yaml', () => {
    it('parses flat top-level scalar and list fields (the same subset frontmatter parsing already supports)', () => {
      const out = parseCodeOutput('count: 3\nname: dead-exports\ntags: [a, b, c]\n', 'yaml', noCoerce)
      expect(out).toEqual({ count: '3', name: 'dead-exports', tags: ['a', 'b', 'c'] })
    })

    it('parses a block list', () => {
      const out = parseCodeOutput('items:\n  - a\n  - b\n', 'yaml', noCoerce)
      expect(out).toEqual({ items: ['a', 'b'] })
    })
  })

  describe('xml', () => {
    it('parses a simple element tree into nested objects', () => {
      const out = parseCodeOutput('<result><count>2</count><name>dead</name></result>', 'xml', noCoerce)
      expect(out).toEqual({ result: { count: '2', name: 'dead' } })
    })

    it('repeated child tags collapse into an array', () => {
      const out = parseCodeOutput('<result><item>a</item><item>b</item></result>', 'xml', noCoerce)
      expect(out).toEqual({ result: { item: ['a', 'b'] } })
    })

    it('captures attributes under _attrs', () => {
      const out = parseCodeOutput('<result id="42"><name>dead</name></result>', 'xml', noCoerce)
      expect(out).toEqual({ result: { _attrs: { id: '42' }, name: 'dead' } })
    })

    it('decodes the five standard XML entities', () => {
      const out = parseCodeOutput('<x>a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;</x>', 'xml', noCoerce)
      expect(out).toEqual({ x: `a & b <c> "d" 'e'` })
    })

    it('strips comments', () => {
      const out = parseCodeOutput('<x><!-- a comment -->hello</x>', 'xml', noCoerce)
      expect(out).toEqual({ x: 'hello' })
    })

    it('throws on a mismatched close tag', () => {
      expect(() => parseCodeOutput('<a><b></a></b>', 'xml', noCoerce)).toThrow(/mismatched close tag/)
    })

    it('throws on malformed/empty input', () => {
      expect(() => parseCodeOutput('not xml at all', 'xml', noCoerce)).toThrow(/parse="xml"/)
    })
  })
})
