// Deterministic synthetic corpus generator for the Class 2 (reduction)
// benchmark: N source files, ~20% missing a matching test file, same
// shape every run for a given seed. Default seed 42, matching the
// original run's seed value; the exact missing-file SET differs from
// that run (this is a from-scratch mulberry32 PRNG, not a port of
// Python's random.sample/Mersenne Twister, so the same seed number does
// not reproduce the same bit sequence across the two), but this
// generator's own output is stable and reproducible run to run, which is
// the property that actually matters: anyone re-running this harness
// gets the same corpus this session measured, byte for byte.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// mulberry32: a small, fast, well-known deterministic PRNG. Not
// cryptographic, not trying to be; only trying to be the same sequence
// every time for the same seed, which Math.random() cannot promise.
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle(arr, rng) {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Generates `n` synthetic module names (moduleNNN, zero-padded to n's own
 * digit width so lexical and numeric sort agree), with round(n * missingFraction)
 * of them missing a matching test file. Returns the plan (names + which
 * are missing) without touching disk; call writeCorpus to materialize it.
 */
export function planCorpus(n, { seed = 42, missingFraction = 0.20 } = {}) {
  const width = String(n - 1).length
  const names = Array.from({ length: n }, (_, i) => `module${String(i).padStart(width, '0')}`)
  const rng = mulberry32(seed)
  const missingCount = Math.round(n * missingFraction)
  const missing = new Set(seededShuffle(names, rng).slice(0, missingCount))
  return { n, seed, missingFraction, names, missing }
}

export function writeCorpus(plan, outDir) {
  const srcDir = join(outDir, 'src')
  const testDir = join(outDir, 'tests')
  mkdirSync(srcDir, { recursive: true })
  mkdirSync(testDir, { recursive: true })
  for (const name of plan.names) {
    writeFileSync(join(srcDir, `${name}.ts`), `export function ${name}() { return '${name}'; }\n`)
    if (!plan.missing.has(name)) {
      writeFileSync(join(testDir, `${name}.test.ts`), `import { ${name} } from '../src/${name}';\ntest('${name}', () => { expect(${name}()).toBeTruthy(); });\n`)
    }
  }
  return { srcDir, testDir }
}
