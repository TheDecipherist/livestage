import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  readCache, writeCache, cacheKey, clearSessionCache, clearPersistCache, showCacheEntries,
} from '../../../src/engine/cache.js'

// Wave 2, feature 21 (Cache): this module had zero test coverage beyond
// cacheKey before this wave. Covers session/persist/mock modes, masking on
// write, expiry, and the mock-fixture checkFilePath gate.
describe('cache: session mode', () => {
  afterEach(() => clearSessionCache())

  it('round-trips a value through session cache', () => {
    const key = cacheKey('read', { path: 'a.json' })
    writeCache(key, 'hello', { mode: 'session' })
    expect(readCache(key, { mode: 'session' })).toBe('hello')
  })

  it('a miss returns null', () => {
    expect(readCache(cacheKey('read', { path: 'nope' }), { mode: 'session' })).toBeNull()
  })

  it('clearSessionCache empties it', () => {
    const key = cacheKey('read', { path: 'x' })
    writeCache(key, 'v', { mode: 'session' })
    clearSessionCache()
    expect(readCache(key, { mode: 'session' })).toBeNull()
  })

  it('a secret-shaped value is masked before it lands in the cache', () => {
    const key = cacheKey('read', { path: 'secretfile' })
    const fakeSecret = ['tok' + 'en', 'x'.repeat(20)].join('=')
    writeCache(key, fakeSecret, { mode: 'session' })
    expect(readCache(key, { mode: 'session' })).toContain('***MASKED***')
  })
})

describe('cache: persist mode', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-cache-persist-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('round-trips a value through .livestage/cache/ under the given cwd, not process.cwd()', () => {
    const key = cacheKey('query', { command: 'git status' })
    writeCache(key, 'clean', { mode: 'persist', ttl: 3600 }, undefined, undefined, dir)
    expect(existsSync(join(dir, '.livestage', 'cache', `${key}.json`))).toBe(true)
    expect(readCache(key, { mode: 'persist' }, undefined, dir)).toBe('clean')
  })

  it('an expired entry reads back as a miss', () => {
    vi.useFakeTimers()
    try {
      const key = cacheKey('query', { command: 'echo hi' })
      writeCache(key, 'hi', { mode: 'persist', ttl: 1 }, undefined, undefined, dir)
      vi.advanceTimersByTime(2000)
      expect(readCache(key, { mode: 'persist' }, undefined, dir)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('showCacheEntries lists persist entries with size, scoped to the given cwd', () => {
    const key = cacheKey('query', { command: 'echo hi' })
    writeCache(key, 'hi', { mode: 'persist', ttl: 3600 }, undefined, undefined, dir)
    const entries = showCacheEntries('persist', dir)
    expect(entries.some(e => e.key === key && typeof e.size === 'number')).toBe(true)
  })

  it('clearPersistCache removes entries from disk, scoped to the given cwd', () => {
    const key = cacheKey('query', { command: 'echo hi' })
    writeCache(key, 'hi', { mode: 'persist', ttl: 3600 }, undefined, undefined, dir)
    clearPersistCache(undefined, dir)
    expect(readCache(key, { mode: 'persist' }, undefined, dir)).toBeNull()
  })

  it('a different cwd does not see entries written under this one (the bug this fixes)', () => {
    const other = mkdtempSync(join(tmpdir(), 'ls-cache-other-'))
    try {
      const key = cacheKey('query', { command: 'echo hi' })
      writeCache(key, 'hi', { mode: 'persist', ttl: 3600 }, undefined, undefined, dir)
      expect(readCache(key, { mode: 'persist' }, undefined, other)).toBeNull()
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  it('persisted values are masked before write, not just on session reads', () => {
    const key = cacheKey('query', { command: 'env' })
    const fakeSecret = ['pass' + 'word', 'hunter2plus'].join('=')
    writeCache(key, fakeSecret, { mode: 'persist', ttl: 3600 }, undefined, undefined, dir)
    const raw = readCache(key, { mode: 'persist' }, undefined, dir)
    expect(raw).not.toContain('hunter2plus')
    expect(raw).toContain('***MASKED***')
  })
})

describe('cache: mock mode (deterministic fixtures)', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-cache-mock-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('serves the fixture file content in place of a live call (relative mockPath, as real usage is)', () => {
    writeFileSync(join(dir, 'fixture.json'), '{"result":"mocked"}')
    const result = readCache('irrelevant', { mode: 'mock', mockPath: 'fixture.json' }, dir)
    expect(result).toBe('{"result":"mocked"}')
  })

  it('a relative mock path that escapes the document root via .. is blocked (checkFilePath traversal gate)', () => {
    const outside = mkdtempSync(join(tmpdir(), 'ls-cache-outside-'))
    try {
      writeFileSync(join(outside, 'fixture.json'), '{"result":"leak"}')
      const result = readCache('irrelevant', { mode: 'mock', mockPath: '../' + outside.split('/').pop() + '/fixture.json' }, dir)
      expect(result).toBeNull()
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })

  it('an absolute mock path outside the built-in safe roots is blocked (checkFilePath absolute-path gate)', () => {
    writeFileSync(join(dir, 'fixture.json'), '{"result":"mocked"}')
    const result = readCache('irrelevant', { mode: 'mock', mockPath: join(dir, 'fixture.json') }, dir)
    expect(result).toBeNull()
  })

  it('a missing mockPath returns null rather than throwing', () => {
    expect(() => readCache('k', { mode: 'mock' }, dir)).not.toThrow()
    expect(readCache('k', { mode: 'mock' }, dir)).toBeNull()
  })
})
