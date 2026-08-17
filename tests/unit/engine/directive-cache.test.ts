import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'
import { clearSessionCache } from '../../../src/engine/cache.js'
import { parseCacheAttrs } from '../../../src/parser/directives/cache-attrs.js'

// Post-initiative known_issues sweep (task 25): 21-cache.md and
// 35-determinism.md both flagged that `mock=` on @query/@code was the only
// real .stage syntax that ever reached cache.ts; session/persist for
// @query/@code and mock/session/persist for @list/@read/@tree/@include were
// parsed into a CacheConfig field that engine.ts never consulted. This file
// covers the parser-side `cache=`/`ttl=`/`mock=` attribute convention and
// its engine-side wiring for all six directives.
describe('parseCacheAttrs', () => {
  it('returns null when neither mock= nor cache= is given', () => {
    expect(parseCacheAttrs({})).toBeNull()
  })

  it('mock= wins over cache=, matching the wave-5 query/code convention', () => {
    expect(parseCacheAttrs({ mock: 'fixture.json', cache: 'session' })).toEqual({ mode: 'mock', mockPath: 'fixture.json' })
  })

  it('cache="session" with no ttl', () => {
    expect(parseCacheAttrs({ cache: 'session' })).toEqual({ mode: 'session' })
  })

  it('cache="persist" with ttl=', () => {
    expect(parseCacheAttrs({ cache: 'persist', ttl: '60' })).toEqual({ mode: 'persist', ttl: 60 })
  })

  it('cache="persist" with no ttl omits the field rather than storing NaN', () => {
    expect(parseCacheAttrs({ cache: 'persist' })).toEqual({ mode: 'persist' })
  })

  it('an unrecognized cache= value is ignored', () => {
    expect(parseCacheAttrs({ cache: 'bogus' })).toBeNull()
  })
})

describe('cache=/mock= wired into real directive syntax', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-directive-cache-'))
    clearSessionCache()
  })

  afterEach(() => {
    clearSessionCache()
    rmSync(dir, { recursive: true, force: true })
  })

  function run(src: string) {
    const filePath = join(dir, 'doc.stage')
    const ast = parse(src, { filePath })
    return execute(ast, {
      filePath,
      ctx: {
        cwd: dir,
        security: {
          allowShell: true, allowHttp: false, allowDb: false, jailRoot: dir,
          shellConfig: { enabled: true, allow_patterns: ['*'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false },
          codeConfig: { languages: ['javascript'], timeout: 30_000, runners: {} },
        },
      },
    })
  }

  it('@list cache="session" serves a stale listing after the directory changes underneath it', () => {
    const dataDir = join(dir, 'data')
    mkdirSync(dataDir)
    writeFileSync(join(dataDir, 'a.txt'), 'x')
    const first = run('@list "data" cache="session" /')
    expect(first.output).toContain('a.txt')
    writeFileSync(join(dataDir, 'b.txt'), 'y')
    const second = run('@list "data" cache="session" /')
    expect(second.output).toBe(first.output)
    expect(second.output).not.toContain('b.txt')
  })

  it('@list without cache= re-reads live every time (no accidental caching)', () => {
    const dataDir = join(dir, 'data')
    mkdirSync(dataDir)
    writeFileSync(join(dataDir, 'a.txt'), 'x')
    run('@list "data" /')
    writeFileSync(join(dataDir, 'b.txt'), 'y')
    const second = run('@list "data" /')
    expect(second.output).toContain('b.txt')
  })

  it('@read cache="persist" round-trips through .livestage/cache/ under the given cwd and serves stale content', () => {
    writeFileSync(join(dir, 'note.txt'), 'first\n')
    const first = run('@read "note.txt" cache="persist" /')
    expect(first.output.trim()).toBe('first')
    expect(existsSync(join(dir, '.livestage', 'cache'))).toBe(true)
    expect(readdirSync(join(dir, '.livestage', 'cache')).length).toBeGreaterThan(0)

    writeFileSync(join(dir, 'note.txt'), 'second\n')
    const second = run('@read "note.txt" cache="persist" /')
    expect(second.output.trim()).toBe('first')
  })

  it('@read still runs the security/path check live on every call, cache hit or not', () => {
    // Path traversal is blocked regardless of cache=; a cache hit must never
    // bypass the jail check that resolveDataPath performs before the cached
    // closure is ever consulted.
    const first = run('@read "../outside.txt" cache="persist" /')
    expect(first.warnings.some(w => w.includes('SECURITY_ALERT'))).toBe(true)
    const second = run('@read "../outside.txt" cache="persist" /')
    expect(second.warnings.some(w => w.includes('SECURITY_ALERT'))).toBe(true)
  })

  it('@tree cache="session" serves a stale tree after a file is added', () => {
    const dataDir = join(dir, 'data')
    mkdirSync(dataDir)
    writeFileSync(join(dataDir, 'a.txt'), 'x')
    const first = run('@tree "data" cache="session" /')
    writeFileSync(join(dataDir, 'b.txt'), 'y')
    const second = run('@tree "data" cache="session" /')
    expect(second.output).toBe(first.output)
    expect(second.output).not.toContain('b.txt')
  })

  it('@query cache="session" runs the command once across two renders', () => {
    const counter = join(dir, 'counter.txt')
    writeFileSync(counter, '')
    const src = `@query "echo x >> ${counter}" cache="session" /`
    run(src)
    run(src)
    const lines = readFileSync(counter, 'utf8').split('\n').filter(Boolean)
    expect(lines.length).toBe(1)
  })

  it('@code cache="session" runs the script once and replays label= data on the cache hit', () => {
    const counter = join(dir, 'code-counter.txt')
    writeFileSync(counter, '0')
    const src = `@code language="javascript" cache="session" label="r"
const fs = require('fs')
const n = Number(fs.readFileSync('${counter.replace(/\\/g, '\\\\')}', 'utf8')) + 1
fs.writeFileSync('${counter.replace(/\\/g, '\\\\')}', String(n))
console.log(JSON.stringify({ n }))
@code-end
{{ r.n }}`
    const first = run(src)
    const second = run(src)
    expect(first.output).toContain('1')
    expect(second.output).toContain('1')
    expect(readFileSync(counter, 'utf8')).toBe('1')
  })

  // Part 5, class 3 composition work: @code's own cache= is keyed on the
  // script's identity (language/src/body/args), never on the CONTENT of
  // files the script reads from disk, so re-running an expensive analysis
  // against a changed source tree silently returned the stale answer.
  // cache-key= folds a content hash of the named glob into the key.
  describe('@code cache-key= (content-hash cache invalidation)', () => {
    function countingScript(counterPath: string): string {
      const escaped = counterPath.replace(/\\/g, '\\\\')
      return `@code language="javascript" cache="session" cache-key="watched/*.txt" label="r"
const fs = require('fs')
const n = Number(fs.readFileSync('${escaped}', 'utf8')) + 1
fs.writeFileSync('${escaped}', String(n))
const files = fs.readdirSync('watched').sort()
console.log(JSON.stringify({ n, files }))
@code-end
{{ r.n }}`
    }

    it('an unchanged watched file set is a cache hit: the script does not re-run', () => {
      mkdirSync(join(dir, 'watched'))
      writeFileSync(join(dir, 'watched', 'a.txt'), 'hello')
      const counter = join(dir, 'counter.txt')
      writeFileSync(counter, '0')
      const src = countingScript(counter)
      const first = run(src)
      const second = run(src)
      expect(first.output).toContain('1')
      expect(second.output).toContain('1')
      expect(readFileSync(counter, 'utf8')).toBe('1')
    })

    it('changing a watched file\'s CONTENT (same file set, same script args) is a cache miss', () => {
      mkdirSync(join(dir, 'watched'))
      writeFileSync(join(dir, 'watched', 'a.txt'), 'hello')
      const counter = join(dir, 'counter.txt')
      writeFileSync(counter, '0')
      const src = countingScript(counter)
      const first = run(src)
      expect(first.output).toContain('1')
      writeFileSync(join(dir, 'watched', 'a.txt'), 'hello, but different now')
      const second = run(src)
      expect(second.output).toContain('2')
    })

    it('adding a new file under the glob is also a cache miss', () => {
      mkdirSync(join(dir, 'watched'))
      writeFileSync(join(dir, 'watched', 'a.txt'), 'hello')
      const counter = join(dir, 'counter.txt')
      writeFileSync(counter, '0')
      const src = countingScript(counter)
      run(src)
      writeFileSync(join(dir, 'watched', 'b.txt'), 'new file')
      const second = run(src)
      expect(second.output).toContain('2')
    })

    it('cache="session" without cache-key= is unaffected: same behavior as before this feature', () => {
      const counter = join(dir, 'no-key-counter.txt')
      writeFileSync(counter, '0')
      const src = `@code language="javascript" cache="session" label="r"
const fs = require('fs')
const n = Number(fs.readFileSync('${counter.replace(/\\/g, '\\\\')}', 'utf8')) + 1
fs.writeFileSync('${counter.replace(/\\/g, '\\\\')}', String(n))
console.log(JSON.stringify({ n }))
@code-end
{{ r.n }}`
      const first = run(src)
      const second = run(src)
      expect(first.output).toContain('1')
      expect(second.output).toContain('1')
    })
  })

  it('@include cache="session" serves stale rendered content after the included file changes', () => {
    writeFileSync(join(dir, 'partial.stage'), 'v1\n')
    const first = run('@include "partial.stage" cache="session" /')
    expect(first.output.trim()).toBe('v1')
    writeFileSync(join(dir, 'partial.stage'), 'v2\n')
    const second = run('@include "partial.stage" cache="session" /')
    expect(second.output.trim()).toBe('v1')
  })

  it('@include mock= serves the fixture without ever reading the real target', () => {
    writeFileSync(join(dir, 'fixture.stage'), 'from the fixture\n')
    // "real.stage" is never created; if the mock branch fell through to a
    // real resolve+read, this would come back empty with a warning instead.
    const result = run('@include "real.stage" mock="fixture.stage" /')
    expect(result.output.trim()).toBe('from the fixture')
  })
})
