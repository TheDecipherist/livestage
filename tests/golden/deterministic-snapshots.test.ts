import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, getAvailableDirectives } from 'livestage/parser'
import { execute } from '../../src/engine/engine.js'
import type { EngineContext } from '../../src/engine/context.js'
import { FIXTURES, buildSecurity, writeFixtureFiles } from './fixtures.js'

// Feature 35 (Determinism)'s own acceptance criterion: "Golden-file
// snapshots for every directive, format, and fallback path pass under
// --deterministic." Reuses the exact directive fixture table
// tests/golden/fixtures.ts maintains (also used by markdown-out.test.ts for
// CR-11), one fixture per registered directive, so directive coverage here
// can't silently drift from "every directive" as the registry grows. Adds
// its own fixtures for the nine @render formats (feature 20) and three
// representative degraded/fallback paths (feature 24), the "format" and
// "fallback path" halves of the same sentence.
const DET_ENV = { LIVESTAGE_DETERMINISTIC: '1', LIVESTAGE_NOW: '2030-01-01T00:00:00.000Z', LIVESTAGE_SEED: 'golden-snapshot-seed' }

const FORMAT_FIXTURES: Record<string, string> = {
  list: '@list ./ match="*.md" | @render type="list" /',
  numbered: '@list ./ match="*.md" | @render type="numbered" /',
  links: '@list ./ match="*.md" | @render type="links" /',
  table: '@list ./ match="*.md" | @render type="table" /',
  code: '@list ./ match="*.md" | @render type="code" /',
  inline: '@list ./ match="*.md" | @render type="inline" /',
  bar: '@list ./ match="*.md" | @render type="bar" /',
  tree: '@list ./ match="*.md" | @render type="tree" /',
  json: '@list ./ match="*.md" | @render type="json" /',
}

const FALLBACK_FIXTURES: Record<string, string> = {
  'read-missing-file': '@read "does-not-exist.txt" /',
  'list-blocked-traversal': '@list "../../etc" /',
  'query-blocked-by-policy': '@query "cat /etc/hostname" /',
}

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ls-det-snapshots-'))
  writeFixtureFiles(dir)
})

afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

function renderDeterministic(src: string, fileName: string): string {
  const filePath = join(dir, fileName)
  const ctx: Partial<EngineContext> = { cwd: dir, docDir: dir, env: DET_ENV, security: buildSecurity(dir) }
  return execute(parse(src, { filePath }), { filePath, ctx }).output
}

function expectByteIdenticalAndStable(src: string, fileName: string): void {
  const first = renderDeterministic(src, fileName)
  const second = renderDeterministic(src, fileName)
  expect(second).toBe(first)
  expect(first).toMatchSnapshot()
}

describe('golden snapshots under --deterministic: every registered directive', () => {
  const registered = getAvailableDirectives().map(d => d.name)

  it('the fixture table covers every directive the parser registry currently declares', () => {
    const missing = registered.filter(name => !(name in FIXTURES))
    expect(missing).toEqual([])
  })

  it.each(registered)('%s', (name) => {
    const src = FIXTURES[name]
    expect(src, `no fixture registered for directive "${name}"`).toBeDefined()
    expectByteIdenticalAndStable(src!, `${name}-det.stage`)
  })
})

describe('golden snapshots under --deterministic: every @render format', () => {
  const formats = Object.keys(FORMAT_FIXTURES)

  it.each(formats)('%s', (name) => {
    expectByteIdenticalAndStable(FORMAT_FIXTURES[name]!, `${name}-format-det.stage`)
  })
})

describe('golden snapshots under --deterministic: representative fallback/degraded paths', () => {
  const paths = Object.keys(FALLBACK_FIXTURES)

  it.each(paths)('%s', (name) => {
    expectByteIdenticalAndStable(FALLBACK_FIXTURES[name]!, `${name}-fallback-det.stage`)
  })
})

describe('the byte-identical check above is not vacuous', () => {
  it('the frozen date snapshot really is frozen: without LIVESTAGE_NOW it does not equal the deterministic snapshot value', () => {
    const filePath = join(dir, 'date-non-det.stage')
    const ctx: Partial<EngineContext> = { cwd: dir, docDir: dir, security: buildSecurity(dir) }
    const wallClockOutput = execute(parse(FIXTURES['date']!, { filePath }), { filePath, ctx }).output
    expect(wallClockOutput).not.toBe('2030-01-01T00:00:00.000Z')
  })

  it('a different LIVESTAGE_SEED changes uuid_v4() output, proving the seed is actually read, not ignored', () => {
    const src = '{{ uuid_v4() }}'
    const filePath = join(dir, 'uuid-seed-check.stage')
    const ctxA: Partial<EngineContext> = { cwd: dir, docDir: dir, env: DET_ENV, security: buildSecurity(dir) }
    const ctxB: Partial<EngineContext> = { cwd: dir, docDir: dir, env: { ...DET_ENV, LIVESTAGE_SEED: 'a-different-seed' }, security: buildSecurity(dir) }
    const a = execute(parse(src, { filePath }), { filePath, ctx: ctxA }).output
    const b = execute(parse(src, { filePath }), { filePath, ctx: ctxB }).output
    expect(a).not.toBe(b)
  })
})
