import { describe, it, expect } from 'vitest'
import { render } from '../../../src/renderer/index.js'

describe('Renderer', () => {
  describe('list format', () => {
    it('renders data as unordered markdown list', () => {
      const out = render({ type: 'list', data: ['alpha', 'beta', 'gamma'] })
      expect(out).toBe('- alpha\n- beta\n- gamma')
    })

    it('produces one bullet per item', () => {
      const out = render({ type: 'list', data: ['only'] })
      expect(out).toBe('- only')
    })
  })

  describe('numbered format', () => {
    it('renders data as ordered markdown list', () => {
      const out = render({ type: 'numbered', data: ['first', 'second', 'third'] })
      expect(out).toBe('1. first\n2. second\n3. third')
    })
  })

  describe('links format', () => {
    it('renders file paths as markdown links', () => {
      const out = render({ type: 'links', data: ['./docs/intro.md', './docs/guide.md'] })
      expect(out).toContain('[intro](./docs/intro.md)')
      expect(out).toContain('[guide](./docs/guide.md)')
    })

    it('strips extension from link text', () => {
      const out = render({ type: 'links', data: ['./foo/bar.md'] })
      expect(out).toContain('[bar]')
    })
  })

  describe('table format', () => {
    it('renders tab-separated rows as GFM pipe table with explicit columns', () => {
      const out = render({
        type: 'table',
        data: ['alice\t30', 'bob\t25'],
        columns: ['Name', 'Age'],
      })
      expect(out).toContain('| Name')
      expect(out).toContain('| Age')
      expect(out).toContain('| alice')
      expect(out).toContain('| bob')
      // Separator row
      expect(out).toContain('|---')
    })

    it('uses first row as headers when no columns provided', () => {
      const out = render({ type: 'table', data: ['Name\tAge', 'carol\t28'] })
      expect(out).toContain('| Name')
      expect(out).toContain('| carol')
    })

    it('pads every cell to its column\'s max width by default (existing behavior, unchanged)', () => {
      const out = render({
        type: 'table',
        data: ['short\tx', 'a\tvery-long-outlier-value-here'],
        columns: ['col1', 'col2'],
      })
      const lines = out.split('\n')
      // Every data/header/separator line in a column-aligned table has the
      // same total length (each row padded to the widest cell per column).
      const lengths = new Set(lines.map(l => l.length))
      expect(lengths.size).toBe(1)
    })

    it('compact="true" skips column-width padding: no long outlier bloats short rows', () => {
      // Feature 20 B1 (2026-08-17): found live in CLAUDE.md's own Commands
      // table, a wide outlier cell (bundle's long esbuild command) padded
      // every other row's command to match, hundreds of trailing spaces
      // per line, pure noise when the file is read as raw text (exactly
      // how Claude Code consumes CLAUDE.md), not through a markdown viewer.
      const out = render({
        type: 'table',
        data: ['short\tx', 'a\tvery-long-outlier-value-here'],
        columns: ['col1', 'col2'],
        options: { compact: 'true' },
      })
      const lines = out.split('\n')
      const shortRow = lines.find(l => l.includes('short'))
      expect(shortRow).toBeDefined()
      // A padded table would make this row's length match the long-outlier
      // row's length; compact mode must not.
      const longRow = lines.find(l => l.includes('very-long-outlier'))
      expect(shortRow!.length).toBeLessThan(longRow!.length)
      // Still a valid GFM table: header, separator, both data rows present.
      expect(out).toContain('col1')
      expect(out).toContain('|---')
      expect(out).toContain('short')
      expect(out).toContain('very-long-outlier-value-here')
    })
  })

  describe('code format', () => {
    it('wraps data in fenced code block', () => {
      const out = render({ type: 'code', data: ['const x = 1', 'const y = 2'] })
      expect(out).toMatch(/^```/)
      expect(out).toMatch(/```$/)
      expect(out).toContain('const x = 1')
    })

    it('includes language when options.lang is set', () => {
      const out = render({ type: 'code', data: ['x = 1'], options: { lang: 'python' } })
      expect(out).toMatch(/^```python/)
    })
  })

  describe('inline format', () => {
    it('returns data joined by space', () => {
      const out = render({ type: 'inline', data: ['hello', 'world'] })
      expect(out).toBe('hello world')
    })

    it('returns scalar value for single item', () => {
      const out = render({ type: 'inline', data: ['42'] })
      expect(out).toBe('42')
    })
  })

  describe('bar format', () => {
    it('renders ASCII bar chart with █ characters', () => {
      const out = render({ type: 'bar', data: ['auth_failure 847', 'timeout 534'] })
      expect(out).toContain('█')
      expect(out).toContain('auth_failure')
      expect(out).toContain('timeout')
    })

    it('max-value item gets full bar width', () => {
      const out = render({ type: 'bar', data: ['top 100', 'mid 50'] })
      const lines = out.split('\n')
      const topLine = lines.find(l => l.includes('top'))!
      const midLine = lines.find(l => l.includes('mid'))!
      expect(topLine!.split('█').length).toBeGreaterThan(midLine!.split('█').length)
    })
  })

  describe('tree format', () => {
    it('wraps tree lines in fenced code block', () => {
      const out = render({ type: 'tree', data: ['├── src/', '└── dist/'] })
      expect(out).toMatch(/^```/)
      expect(out).toContain('├── src/')
    })
  })

  describe('json format', () => {
    it('wraps JSON in fenced json code block', () => {
      const out = render({ type: 'json', data: ['{"name":"Alice","age":30}'] })
      expect(out).toMatch(/^```json/)
      expect(out).toContain('"name"')
      expect(out).toContain('"Alice"')
    })

    it('pretty-prints JSON with 2-space indentation', () => {
      const out = render({ type: 'json', data: ['{"a":1}'] })
      expect(out).toContain('  "a": 1')
    })
  })

  // Class 3 composition work: every format now also accepts an array of
  // objects (from @render source=), not just an array of strings.
  describe('object-array data (RendererInput.data as Record<string, unknown>[])', () => {
    const rows = [
      { symbol: 'lex', file: 'lexer.ts', kind: 'function' },
      { symbol: 'ASTNodeBase', file: 'types.ts', kind: 'type' },
    ]

    it('table derives headers from the first object\'s keys when columns= is not given', () => {
      const out = render({ type: 'table', data: rows })
      expect(out).toContain('| symbol')
      expect(out).toContain('| file')
      expect(out).toContain('| kind')
      expect(out).toContain('| lex')
      expect(out).toContain('| ASTNodeBase')
    })

    it('table honors columns= for both selection and order', () => {
      const out = render({ type: 'table', data: rows, columns: ['kind', 'symbol'] })
      const header = out.split('\n')[0]!
      expect(header.indexOf('kind')).toBeLessThan(header.indexOf('symbol'))
      expect(out).not.toContain('| file')
    })

    it('list renders one bullet per object using every field when columns= is absent', () => {
      const out = render({ type: 'list', data: [{ name: 'a', n: 1 }] })
      expect(out).toBe('- name: a, n: 1')
    })

    it('list uses a single named column\'s value directly, not a key: value pair', () => {
      const out = render({ type: 'list', data: rows, columns: ['symbol'] })
      expect(out).toBe('- lex\n- ASTNodeBase')
    })

    it('numbered renders one object per line, respecting columns=', () => {
      const out = render({ type: 'numbered', data: rows, columns: ['symbol'] })
      expect(out).toBe('1. lex\n2. ASTNodeBase')
    })

    it('bar derives label/value from columns= for object rows', () => {
      const out = render({ type: 'bar', data: [{ name: 'auth_failure', count: 847 }, { name: 'timeout', count: 534 }], columns: ['name', 'count'] })
      expect(out).toContain('auth_failure')
      expect(out).toContain('847')
      expect(out).toContain('█')
    })

    it('links derives label/href from a single named column', () => {
      const out = render({ type: 'links', data: [{ path: './docs/intro.md' }], columns: ['path'] })
      expect(out).toContain('[intro](./docs/intro.md)')
    })

    it('inline joins one value per object', () => {
      const out = render({ type: 'inline', data: rows, columns: ['symbol'] })
      expect(out).toBe('lex ASTNodeBase')
    })

    it('json renders the raw resolved value directly (an object, not an array of data rows)', () => {
      const out = render({ type: 'json', data: [], raw: { count: 2, items: rows } })
      expect(out).toContain('"count": 2')
      expect(out).toContain('"lex"')
    })

    it('json renders a raw array the same way', () => {
      const out = render({ type: 'json', data: [], raw: rows })
      expect(out).toContain('"symbol": "lex"')
    })

    it('code renders a raw string verbatim (parse="text" @code output via source=)', () => {
      const out = render({ type: 'code', data: [], raw: 'line one\nline two' })
      expect(out).toBe('```\nline one\nline two\n```')
    })

    it('tree groups object rows by a slash-delimited breadcrumb column, same as tab-separated rows', () => {
      const out = render({
        type: 'tree',
        data: [
          { path: 'src/parser', status: 'active' },
          { path: 'src/engine', status: 'active' },
        ],
      })
      expect(out).toContain('src')
      expect(out).toContain('parser')
      expect(out).toContain('engine')
    })
  })

  describe('unknown type', () => {
    it('throws with informative message for unknown type', () => {
      expect(() => render({ type: 'unknown' as never, data: [] })).toThrow(/unknown render type/i)
    })

    it('error message lists valid types', () => {
      let msg = ''
      try { render({ type: 'unknown' as never, data: [] }) } catch (e) { msg = String(e) }
      expect(msg).toContain('list')
    })
  })
})
