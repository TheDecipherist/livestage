import { describe, it, expect } from 'vitest'
import { applySort, applyLimit, applyWhere } from '../../../src/engine/render-data.js'

describe('render-data', () => {
  describe('applySort', () => {
    const rows = [{ file: 'b.ts', count: 2 }, { file: 'a.ts', count: 5 }, { file: 'c.ts', count: 1 }]

    it('sorts ascending by a named field', () => {
      const out = applySort(rows, 'file')
      expect(out.map(r => r.file)).toEqual(['a.ts', 'b.ts', 'c.ts'])
    })

    it('sorts descending with a leading -', () => {
      const out = applySort(rows, '-count')
      expect(out.map(r => r.count)).toEqual([5, 2, 1])
    })

    it('is stable: equal keys keep original relative order', () => {
      const tied = [{ file: 'x', n: 1 }, { file: 'x', n: 2 }, { file: 'x', n: 3 }]
      const out = applySort(tied, 'file')
      expect(out.map(r => r.n)).toEqual([1, 2, 3])
    })

    it('no sort= is a no-op', () => {
      expect(applySort(rows, undefined)).toEqual(rows)
    })

    it('does not mutate the input array', () => {
      const original = [...rows]
      applySort(rows, 'file')
      expect(rows).toEqual(original)
    })
  })

  describe('applyLimit', () => {
    const items = [1, 2, 3, 4, 5]

    it('truncates to the first N items', () => {
      expect(applyLimit(items, '3')).toEqual([1, 2, 3])
    })

    it('no limit= is a no-op', () => {
      expect(applyLimit(items, undefined)).toEqual(items)
    })

    it('a limit larger than the array returns everything', () => {
      expect(applyLimit(items, '100')).toEqual(items)
    })

    it('an invalid limit= is a no-op rather than throwing or emptying', () => {
      expect(applyLimit(items, 'abc')).toEqual(items)
    })
  })

  describe('applyWhere', () => {
    const rows = [
      { symbol: 'lex', kind: 'function' },
      { symbol: 'ASTNodeBase', kind: 'type' },
      { symbol: 'parse', kind: 'function' },
    ]

    it('filters object rows by a simple field predicate', () => {
      const out = applyWhere(rows, "kind == 'type'")
      expect(out).toEqual([{ symbol: 'ASTNodeBase', kind: 'type' }])
    })

    it('no where= is a no-op', () => {
      expect(applyWhere(rows, undefined)).toEqual(rows)
    })

    it('wraps a scalar row as { value } so where="value > N" works on a plain array', () => {
      expect(applyWhere([1, 5, 10], 'value > 3')).toEqual([5, 10])
    })
  })
})
