import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { planCorpus, writeCorpus } from '../../../benchmarks/lib/corpus.mjs'

// The Class 2 benchmark's correctness gate depends entirely on this
// generator being genuinely deterministic (same seed -> same corpus,
// every run, every machine): a benchmark that can't reproduce its own
// input is not a benchmark. Covered here at the unit level so a change to
// the generator that breaks determinism fails fast, before anyone
// notices the benchmark's own correctness gate going red for a confusing
// reason three layers away.
describe('benchmarks/lib/corpus.mjs: deterministic corpus generation', () => {
  it('the same seed produces the exact same plan, every call', () => {
    const a = planCorpus(50, { seed: 42 })
    const b = planCorpus(50, { seed: 42 })
    expect(a.names).toEqual(b.names)
    expect([...a.missing].sort()).toEqual([...b.missing].sort())
  })

  it('a different seed produces a different missing set', () => {
    const a = planCorpus(50, { seed: 42 })
    const b = planCorpus(50, { seed: 1 })
    expect([...a.missing].sort()).not.toEqual([...b.missing].sort())
  })

  it('missing count is ~20% by default, rounded', () => {
    expect(planCorpus(5).missing.size).toBe(1)
    expect(planCorpus(50).missing.size).toBe(10)
    expect(planCorpus(500).missing.size).toBe(100)
    expect(planCorpus(5000).missing.size).toBe(1000)
  })

  it('missingFraction is configurable', () => {
    expect(planCorpus(100, { missingFraction: 0.5 }).missing.size).toBe(50)
  })

  it('module names are zero-padded so lexical and numeric sort agree', () => {
    const plan = planCorpus(150)
    expect(plan.names[0]).toBe('module000')
    expect(plan.names[149]).toBe('module149')
  })
})

describe('benchmarks/lib/corpus.mjs: writeCorpus materializes the plan on disk', () => {
  let dir: string | undefined

  afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }) })

  it('writes exactly N source files and (N - missing) test files', () => {
    dir = mkdtempSync(join(tmpdir(), 'ls-corpus-test-'))
    const plan = planCorpus(20, { seed: 42 })
    writeCorpus(plan, dir)
    expect(readdirSync(join(dir, 'src'))).toHaveLength(20)
    expect(readdirSync(join(dir, 'tests'))).toHaveLength(20 - plan.missing.size)
  })

  it('every missing-planned module has no test file; every other module does', () => {
    dir = mkdtempSync(join(tmpdir(), 'ls-corpus-test-'))
    const plan = planCorpus(20, { seed: 42 })
    writeCorpus(plan, dir)
    const testBaseNames = new Set(readdirSync(join(dir, 'tests')).map(f => f.replace(/\.test\.ts$/, '')))
    for (const name of plan.names) {
      expect(testBaseNames.has(name)).toBe(!plan.missing.has(name))
    }
  })
})
