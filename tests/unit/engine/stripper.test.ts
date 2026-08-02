import { describe, it, expect } from 'vitest'
import { parse } from 'livestage/parser'
import { strip } from '../../../src/engine/stripper.js'
import { clearSessionCache, clearPersistCache, showCacheEntries, writeCache, cacheKey } from '../../../src/engine/cache.js'

describe('strip — node removal rules', () => {
  it('removes a leading unregistered marker line', () => {
    const ast = parse('@legacy-tool\nHello')
    const result = strip(ast)
    expect(result.output).not.toContain('@legacy-tool')
    expect(result.output).toContain('Hello')
  })

  it('passes through markdown content unchanged', () => {
    const ast = parse('# Heading\n\nParagraph text.')
    const result = strip(ast)
    expect(result.output).toContain('# Heading')
    expect(result.output).toContain('Paragraph text.')
  })

  it('removes @env directives', () => {
    const ast = parse('@env MY_VAR default /\nSome text')
    const result = strip(ast)
    expect(result.output).not.toContain('@env')
    expect(result.output).toContain('Some text')
  })


  it('removes @define blocks entirely', () => {
    const ast = parse('@define greet\nHello!\n@define-end\nAfter')
    const result = strip(ast)
    expect(result.output).not.toContain('@define')
    expect(result.output).not.toContain('@end')
    expect(result.output).toContain('After')
  })

  it('removes @call directives', () => {
    const ast = parse('@call greet /\nAfter')
    const result = strip(ast)
    expect(result.output).not.toContain('@call')
    expect(result.output).toContain('After')
  })

  it('resolves @if conditional true branch', () => {
    const ast = parse('@if true\nTrue branch\n@else\nFalse branch\n@if-end')
    const result = strip(ast, { env: {} })
    expect(result.output).toContain('True branch')
    expect(result.output).not.toContain('False branch')
  })

  it('resolves @if with env variable', () => {
    const ast = parse('@if NODE_ENV === "production"\nProd content\n@else\nDev content\n@if-end')
    const result = strip(ast, { env: { NODE_ENV: 'production' } })
    expect(result.output).toContain('Prod content')
    expect(result.output).not.toContain('Dev content')
  })

  it('@else renders when condition is false', () => {
    const ast = parse('@if false\nTrue branch\n@else\nFalse branch\n@if-end')
    const result = strip(ast)
    expect(result.output).not.toContain('True branch')
    expect(result.output).toContain('False branch')
  })

  it('removes data directives (list, read, tree, date, count, db, http, query)', () => {
    const ast = parse('@list ./src /\nAfter')
    const result = strip(ast)
    expect(result.output).not.toContain('@list')
    expect(result.output).toContain('After')
  })

  it('removes pipe chains', () => {
    const ast = parse('@list ./src | sort | @render type=list /\nAfter')
    const result = strip(ast)
    expect(result.output).not.toContain('@list')
    expect(result.output).toContain('After')
  })

  it('strips @graph directives to empty (CR-6 fallback)', () => {
    const ast = parse('@graph target="*.md" /\nAfter')
    const result = strip(ast)
    expect(result.output).not.toContain('@graph')
    expect(result.output).toContain('After')
  })

  it('resolves interpolations against env', () => {
    const ast = parse('Hello {{NAME}}!')
    const result = strip(ast, { env: { NAME: 'World' } })
    expect(result.output).toContain('Hello World!')
  })

  it('removes unresolvable interpolations', () => {
    const ast = parse('Hello {{UNSET_VAR}}!')
    const result = strip(ast, { env: {} })
    expect(result.output).toContain('Hello !')
  })

  it('warns about unset variables in @if conditions', () => {
    const ast = parse('@if UNSET_VAR === "x"\nbranch\n@if-end')
    const result = strip(ast, { env: {} })
    expect(result.warnings.some(w => w.includes('UNSET_VAR'))).toBe(true)
  })

})

describe('cache management', () => {
  it('clearSessionCache clears in-memory entries', () => {
    const key = cacheKey('test', { id: 'session-test' })
    writeCache(key, 'test-value', { mode: 'session' })
    clearSessionCache()
    const entries = showCacheEntries('session')
    expect(entries.length).toBe(0)
  })

  it('showCacheEntries returns session entries', () => {
    clearSessionCache()
    const key = cacheKey('list', { path: './test' })
    writeCache(key, 'value', { mode: 'session' })
    const entries = showCacheEntries('session')
    expect(entries.length).toBeGreaterThan(0)
    expect(entries[0]?.mode).toBe('session')
    clearSessionCache()
  })

  it('showCacheEntries returns both when no mode specified', () => {
    clearSessionCache()
    const key = cacheKey('env', { name: 'test-all' })
    writeCache(key, 'v', { mode: 'session' })
    const entries = showCacheEntries()
    const sessionEntries = entries.filter(e => e.mode === 'session')
    expect(sessionEntries.length).toBeGreaterThan(0)
    clearSessionCache()
  })

  it('clearPersistCache does not throw when cache dir absent', () => {
    expect(() => clearPersistCache()).not.toThrow()
  })
})
