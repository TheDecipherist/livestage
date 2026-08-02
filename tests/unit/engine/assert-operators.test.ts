import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'
import type { AssertResult } from '../../../src/engine/assert/operators.js'

// Wave 3, feature 26 (Assert Operators): [new], no donor source, built from
// scratch. Vacuity semantics (Principle 7) are the load-bearing design
// point: contains-class assertions FAIL on zero matches; only `absent` may
// pass vacuously, and only `absent` gets the vacuous:true flag.
describe('@assert operators', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-assert-'))
    writeFileSync(join(dir, 'a.txt'), 'hello world')
    writeFileSync(join(dir, 'b.txt'), 'goodbye')
    mkdirSync(join(dir, 'sub'), { recursive: true })
    writeFileSync(join(dir, 'sub', 'c.txt'), 'hello again')
    writeFileSync(join(dir, 'data.json'), JSON.stringify({ name: 'demo', nested: { x: 1 }, list: [10, 20] }))
    writeFileSync(join(dir, 'doc.md'), '---\nstatus: active\n---\nbody')
  })

  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  function renderAssertions(src: string): { output: string; results: AssertResult[] } {
    const ast = parse(src, { filePath: join(dir, 'doc.stage') })
    const results: AssertResult[] = []
    const result = execute(ast, { ctx: { cwd: dir, assertResults: results, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
    return { output: result.output, results }
  }

  describe('file-exists', () => {
    it('passes when the target matches at least one file', () => {
      const { results } = renderAssertions('@assert operator="file-exists" target="a.txt" /')
      expect(results[0]).toMatchObject({ operator: 'file-exists', matches: 1, passed: true, vacuous: false })
    })

    it('FAILS on zero matches, never a vacuous pass', () => {
      const { results } = renderAssertions('@assert operator="file-exists" target="missing.txt" /')
      expect(results[0]).toMatchObject({ matches: 0, passed: false, vacuous: false })
    })

    it('resolves a glob target across subdirectories', () => {
      const { results } = renderAssertions('@assert operator="file-exists" target="**/*.txt" /')
      expect(results[0]?.matches).toBe(3)
      expect(results[0]?.passed).toBe(true)
    })
  })

  describe('contains', () => {
    it('passes when every matched file contains pattern', () => {
      const { results } = renderAssertions('@assert operator="contains" target="a.txt" pattern="hello" /')
      expect(results[0]).toMatchObject({ passed: true, vacuous: false })
    })

    it('FAILS when the target has zero matches (never vacuous)', () => {
      const { results } = renderAssertions('@assert operator="contains" target="missing.txt" pattern="x" /')
      expect(results[0]).toMatchObject({ matches: 0, passed: false, vacuous: false })
    })

    it('FAILS when only some matched files contain the pattern', () => {
      const { results } = renderAssertions('@assert operator="contains" target="*.txt" pattern="hello" /')
      expect(results[0]).toMatchObject({ passed: false })
    })
  })

  describe('some-contains', () => {
    it('passes when at least one matched file contains the pattern', () => {
      const { results } = renderAssertions('@assert operator="some-contains" target="*.txt" pattern="goodbye" /')
      expect(results[0]).toMatchObject({ passed: true, vacuous: false })
    })

    it('FAILS on zero matches', () => {
      const { results } = renderAssertions('@assert operator="some-contains" target="missing.txt" pattern="x" /')
      expect(results[0]).toMatchObject({ matches: 0, passed: false, vacuous: false })
    })

    it('FAILS when no matched file contains the pattern', () => {
      const { results } = renderAssertions('@assert operator="some-contains" target="*.txt" pattern="zzz-nowhere" /')
      expect(results[0]).toMatchObject({ passed: false })
    })
  })

  describe('contains-if-present', () => {
    it('passes vacuously and WITHOUT the vacuous flag when the target is missing', () => {
      const { results } = renderAssertions('@assert operator="contains-if-present" target="missing.txt" pattern="x" /')
      expect(results[0]).toMatchObject({ matches: 0, passed: true, vacuous: false })
    })

    it('passes when the present file contains the pattern', () => {
      const { results } = renderAssertions('@assert operator="contains-if-present" target="a.txt" pattern="hello" /')
      expect(results[0]).toMatchObject({ passed: true, vacuous: false })
    })

    it('FAILS when the present file does not contain the pattern', () => {
      const { results } = renderAssertions('@assert operator="contains-if-present" target="a.txt" pattern="zzz" /')
      expect(results[0]).toMatchObject({ passed: false })
    })
  })

  describe('absent', () => {
    it('is the only operator that passes vacuously, flagged vacuous:true, when the target has zero matches', () => {
      const { results } = renderAssertions('@assert operator="absent" target="missing.txt" pattern="x" /')
      expect(results[0]).toMatchObject({ matches: 0, passed: true, vacuous: true })
    })

    it('passes, NOT vacuous, when files exist but none contain the pattern', () => {
      const { results } = renderAssertions('@assert operator="absent" target="a.txt" pattern="zzz-nowhere" /')
      expect(results[0]).toMatchObject({ matches: 1, passed: true, vacuous: false })
    })

    it('FAILS when a matched file contains the pattern', () => {
      const { results } = renderAssertions('@assert operator="absent" target="a.txt" pattern="hello" /')
      expect(results[0]).toMatchObject({ passed: false, vacuous: false })
    })
  })

  describe('json-key', () => {
    it('passes when a nested key path is present', () => {
      const { results } = renderAssertions('@assert operator="json-key" target="data.json" key="nested.x" /')
      expect(results[0]).toMatchObject({ passed: true })
    })

    it('supports equals= to check the value, not just presence', () => {
      const pass = renderAssertions('@assert operator="json-key" target="data.json" key="nested.x" equals="1" /')
      expect(pass.results[0]).toMatchObject({ passed: true })
      const fail = renderAssertions('@assert operator="json-key" target="data.json" key="nested.x" equals="99" /')
      expect(fail.results[0]).toMatchObject({ passed: false })
    })

    it('supports array index addressing', () => {
      const { results } = renderAssertions('@assert operator="json-key" target="data.json" key="list[1]" equals="20" /')
      expect(results[0]).toMatchObject({ passed: true })
    })

    it('FAILS when the key path is absent', () => {
      const { results } = renderAssertions('@assert operator="json-key" target="data.json" key="nope.nested" /')
      expect(results[0]).toMatchObject({ passed: false })
    })

    it('FAILS on zero matches (missing target file)', () => {
      const { results } = renderAssertions('@assert operator="json-key" target="missing.json" key="x" /')
      expect(results[0]).toMatchObject({ matches: 0, passed: false })
    })

    it('reads a top-level frontmatter field on a markdown target', () => {
      const { results } = renderAssertions('@assert operator="json-key" target="doc.md" key="status" equals="active" /')
      expect(results[0]).toMatchObject({ passed: true })
    })
  })

  it('every result matches the { operator, target, matches, passed, vacuous } shape', () => {
    const { results } = renderAssertions('@assert operator="file-exists" target="a.txt" /')
    expect(Object.keys(results[0]!).sort()).toEqual(['matches', 'operator', 'passed', 'target', 'vacuous'])
  })

  it('deleting the target file flips a passing assertion to FAIL, never a vacuous pass', () => {
    const scratch = mkdtempSync(join(tmpdir(), 'ls-assert-delete-'))
    try {
      writeFileSync(join(scratch, 'gone.txt'), 'present')
      const ast = parse('@assert operator="contains" target="gone.txt" pattern="present" /', { filePath: join(scratch, 'doc.stage') })
      const before: AssertResult[] = []
      execute(ast, { ctx: { cwd: scratch, assertResults: before, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: scratch } } })
      expect(before[0]?.passed).toBe(true)

      rmSync(join(scratch, 'gone.txt'))
      const after: AssertResult[] = []
      execute(ast, { ctx: { cwd: scratch, assertResults: after, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: scratch } } })
      expect(after[0]).toMatchObject({ matches: 0, passed: false, vacuous: false })
    } finally {
      rmSync(scratch, { recursive: true, force: true })
    }
  })
})
