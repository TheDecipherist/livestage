#!/usr/bin/env node
// CR-7 (Suite Baseline, feature 25): the test count must never fall below
// the recorded floor. Reads vitest's own JSON reporter output
// (.vitest-results.json, written alongside the normal run by `npm test`,
// see vitest.config.ts) rather than re-running the suite, and compares
// numTotalTests against scripts/test-baseline.json's baseline.
//
// Usage:
//   node scripts/check-test-baseline.mjs          check only, exit 1 if below baseline
//   node scripts/check-test-baseline.mjs --update  raise the baseline to the current count
//
// --update never lowers the baseline: a run with fewer tests than the
// recorded floor still fails, exactly like a plain check, so a deletion
// can't be laundered into the new floor by accident.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const resultsPath = join(repoRoot, '.vitest-results.json')
const baselinePath = join(repoRoot, 'scripts', 'test-baseline.json')

if (!existsSync(resultsPath)) {
  console.error(`check-test-baseline: ${resultsPath} not found. Run "npm test" first (it writes this file via vitest's json reporter).`)
  process.exit(2)
}

const results = JSON.parse(readFileSync(resultsPath, 'utf8'))
const currentCount = results.numTotalTests
if (typeof currentCount !== 'number') {
  console.error('check-test-baseline: .vitest-results.json has no numTotalTests field, cannot check.')
  process.exit(2)
}

const baselineDoc = JSON.parse(readFileSync(baselinePath, 'utf8'))
const baseline = baselineDoc.baseline

if (currentCount < baseline) {
  console.error(`check-test-baseline: FAIL. Current test count ${currentCount} is below the recorded baseline ${baseline} (a drop of ${baseline - currentCount}). If this is an intentional, reviewed exclusion, update scripts/test-baseline.json's baseline field and note directly; do not silently lower it via --update.`)
  process.exit(1)
}

const shouldUpdate = process.argv.includes('--update')
if (shouldUpdate && currentCount > baseline) {
  baselineDoc.baseline = currentCount
  baselineDoc.recordedAt = new Date().toISOString().slice(0, 10)
  writeFileSync(baselinePath, JSON.stringify(baselineDoc, null, 2) + '\n', 'utf8')
  console.log(`check-test-baseline: baseline raised ${baseline} -> ${currentCount}.`)
} else {
  console.log(`check-test-baseline: OK. ${currentCount} >= baseline ${baseline}.`)
}
