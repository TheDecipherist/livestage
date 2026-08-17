#!/usr/bin/env node
// Class 2 (reduction): sweeps a synthetic coverage-map corpus at four
// sizes and measures four arms:
//   A  raw listing        (find src, find tests, full output, the model reduces)
//   B  as-shipped render  (test-coverage-map.stage: the CURRENT headline example)
//   B-side-by-side        (the OLD headline, kept for contrast: lists both dirs, does not reduce)
//   D  hand-optimal        (a plain Node set-difference, reduces before returning)
//
// Run: node benchmarks/class2-coverage-map.mjs [sizes...]
// Default sizes: 5 50 500 5000. Requires `npm run build` (dist/cli/cli.js).
import { mkdtempSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync, symlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { countTokens } from './lib/tokens.mjs'
import { planCorpus, writeCorpus } from './lib/corpus.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')

if (!existsSync(cliEntry)) {
  console.error('benchmarks/class2-coverage-map.mjs: dist/cli/cli.js missing. Run `npm run build` first.')
  process.exit(1)
}

const SIZES = process.argv.slice(2).map(Number).filter(n => n > 0)
const sizes = SIZES.length > 0 ? SIZES : [5, 50, 500, 5000]

const COVERAGE_MAP_STAGE = readSource('examples/drift/test-coverage-map/test-coverage-map.stage')
const COVERAGE_MAP_TERSE_STAGE = readSource('examples/drift/test-coverage-map/test-coverage-map-terse.stage')
const SIDE_BY_SIDE_STAGE = readSource('examples/drift/test-coverage-map/test-coverage-map-side-by-side.stage')

function readSource(relPath) {
  return readFileSync(join(repoRoot, relPath), 'utf8')
}

function render(stageSource, corpusDir) {
  const scratch = mkdtempSync(join(tmpdir(), 'ls-bench-c2-'))
  try {
    writeFileSync(join(scratch, 'doc.stage'), stageSource)
    // The example's own directives reference "sample-project/src" and
    // "sample-project/tests"; the synthetic corpus is generated directly
    // as src/ and tests/, so symlink sample-project -> . to reuse the
    // exact same .stage source unmodified rather than forking a
    // benchmark-only copy that could drift from what ships.
    symlinkSync(corpusDir, join(scratch, 'sample-project'))
    const out = execFileSync('node', [cliEntry, 'render', 'doc.stage'], { cwd: scratch, encoding: 'utf8' })
    return out
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

// Arm A: raw listing, full output, the model has to reduce it.
function armA(corpusDir) {
  const src = readdirSync(join(corpusDir, 'src'))
  const tests = readdirSync(join(corpusDir, 'tests'))
  const text = [
    `$ find src -name '*.ts'`, ...src.map(f => `src/${f}`),
    `$ find tests -name '*.test.ts'`, ...tests.map(f => `tests/${f}`),
  ].join('\n') + '\n'
  return { tokens: countTokens(text), text }
}

// Arm D: hand-optimal, a plain Node set difference, reduces before
// returning (the "skeptic's arm": if a render doesn't clearly beat this,
// the reduction's value belongs to the reduction itself, not livestage).
function armD(corpusDir) {
  const src = readdirSync(join(corpusDir, 'src')).map(f => f.replace(/\.ts$/, ''))
  const tests = new Set(readdirSync(join(corpusDir, 'tests')).map(f => f.replace(/\.test\.ts$/, '')))
  const gap = src.filter(name => !tests.has(name)).sort()
  const text = gap.join('\n') + (gap.length ? '\n' : '')
  return { tokens: countTokens(text), text, gap }
}

function verifyCorrectness(plan, dArm) {
  const expected = [...plan.missing].sort()
  const actual = dArm.gap.slice().sort()
  const matches = expected.length === actual.length && expected.every((v, i) => v === actual[i])
  return { matches, expected, actual }
}

function main() {
  console.log('Class 2 (reduction): coverage-map, synthetic corpus, seed 42\n')
  const rows = []

  for (const n of sizes) {
    const plan = planCorpus(n, { seed: 42 })
    const scratchCorpus = mkdtempSync(join(tmpdir(), `ls-bench-c2-corpus-${n}-`))
    writeCorpus(plan, scratchCorpus)

    const a = armA(scratchCorpus)
    const b = render(COVERAGE_MAP_STAGE, scratchCorpus)
    const bTerse = render(COVERAGE_MAP_TERSE_STAGE, scratchCorpus)
    const bSideBySide = render(SIDE_BY_SIDE_STAGE, scratchCorpus)
    const d = armD(scratchCorpus)
    const correctness = verifyCorrectness(plan, d)

    rmSync(scratchCorpus, { recursive: true, force: true })

    if (!correctness.matches) {
      console.error(`CORRECTNESS GATE FAILED at N=${n}: expected ${JSON.stringify(correctness.expected)}, got ${JSON.stringify(correctness.actual)}`)
      process.exit(1)
    }

    rows.push({
      n,
      aTokens: a.tokens,
      bTokens: countTokens(b),
      bTerseTokens: countTokens(bTerse),
      bSideBySideTokens: countTokens(bSideBySide),
      dTokens: d.tokens,
    })
  }

  console.log('Correctness gate: PASSED at every size (the render\'s gap set exactly matches the corpus generator\'s planted missing set).\n')
  console.log('B (annotated) carries teaching prose fixed in size regardless of corpus size; B-terse strips it, the fair')
  console.log('comparison against D per the delivery report\'s own arm-C methodology (a render vs. raw shell output should')
  console.log('never be a teaching document vs. a data dump).\n')
  console.log('| N | A raw listing | B annotated | B terse | B side-by-side (old) | D hand-optimal | A/B-terse | B-terse/D |')
  console.log('|---:|---:|---:|---:|---:|---:|---:|---:|')
  for (const r of rows) {
    const aOverBTerse = (r.aTokens / r.bTerseTokens).toFixed(2)
    const bTerseOverD = (r.bTerseTokens / r.dTokens).toFixed(2)
    console.log(`| ${r.n.toLocaleString()} | ${r.aTokens.toLocaleString()} | ${r.bTokens.toLocaleString()} | ${r.bTerseTokens.toLocaleString()} | ${r.bSideBySideTokens.toLocaleString()} | ${r.dTokens.toLocaleString()} | ${aOverBTerse}x | ${bTerseOverD}x |`)
  }
  console.log('')

  for (const r of rows) {
    const bTerseOverD = r.bTerseTokens / r.dTokens
    const verdict = bTerseOverD <= 1.05 ? 'BEATS or TIES D' : bTerseOverD <= 1.5 ? 'lands NEAR D' : 'LOSES to D'
    console.log(`N=${r.n}: B-terse/D = ${bTerseOverD.toFixed(2)}x -> ${verdict}`)
  }
}

main()
