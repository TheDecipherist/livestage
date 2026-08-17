// Gate 3: tests neutered rather than fixed. it.only silently passes a
// whole suite by running one test; it.skip and a commented-out
// expectation are the quieter versions.
//
// Three checks:
//   1. zero `.only(` anywhere in tests/
//   2. `.skip(` count never above a committed floor (skip-floor.json),
//      each occurrence carrying a reason comment on the same line or
//      the line immediately above
//   3. total test count never drops below scripts/test-baseline.json's
//      recorded floor, reusing that exact file rather than a second one
const fs = require('fs')
const path = require('path')

const REPO_ROOT = path.resolve(process.cwd(), '..', '..')
const GATE_DIR = process.cwd()
const TESTS_DIR = path.join(REPO_ROOT, 'tests')

function walkTestFiles(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTestFiles(full, out)
    } else if (entry.name.endsWith('.test.ts')) {
      out.push(full)
    }
  }
  return out
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}

// Matches `it.only(`, `describe.only(`, `test.only(`, `it.skip(`, etc.
// Word-boundary anchored so a legitimate identifier like `myOnlyThing`
// never false-positives.
const ONLY_RE = /\b(it|describe|test)\.only\s*\(/
const SKIP_RE = /\b(it|describe|test)\.skip\s*\(/

function main() {
  const files = walkTestFiles(TESTS_DIR, [])
  const skipFloor = loadJson(path.join(GATE_DIR, 'skip-floor.json'), { max_skip: 0 }).max_skip

  const onlyHits = []
  const skipHits = []
  const skipMissingReason = []

  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file)
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (ONLY_RE.test(line)) onlyHits.push(`${rel}:${i + 1}`)
      if (SKIP_RE.test(line)) {
        skipHits.push(`${rel}:${i + 1}`)
        const sameLine = line.includes('//')
        const lineAbove = (lines[i - 1] ?? '').trim().startsWith('//')
        if (!sameLine && !lineAbove) skipMissingReason.push(`${rel}:${i + 1}`)
      }
    })
  }

  const problems = []
  if (onlyHits.length > 0) {
    problems.push(`${onlyHits.length} .only( found (must be zero): ${onlyHits.join(', ')}`)
  }
  if (skipHits.length > skipFloor) {
    problems.push(`${skipHits.length} .skip( found, above the committed floor of ${skipFloor} (gates/03-tests-neutered/skip-floor.json): ${skipHits.join(', ')}`)
  }
  if (skipMissingReason.length > 0) {
    problems.push(`${skipMissingReason.length} .skip( with no reason comment on the same or preceding line: ${skipMissingReason.join(', ')}`)
  }

  // Reuses scripts/test-baseline.json and .vitest-results.json directly,
  // the same files check-test-baseline.mjs itself reads, rather than a
  // second baseline file or a second test run triggered from here.
  const baselineDoc = loadJson(path.join(REPO_ROOT, 'scripts', 'test-baseline.json'), null)
  const resultsPath = path.join(REPO_ROOT, '.vitest-results.json')
  let currentCount = null
  if (fs.existsSync(resultsPath)) {
    const results = loadJson(resultsPath, {})
    currentCount = typeof results.numTotalTests === 'number' ? results.numTotalTests : null
  }
  if (!baselineDoc) {
    problems.push('scripts/test-baseline.json missing or unreadable')
  } else if (currentCount === null) {
    problems.push('.vitest-results.json missing or has no numTotalTests; run `npm test` first')
  } else if (currentCount < baselineDoc.baseline) {
    problems.push(`test count ${currentCount} is below the recorded baseline ${baselineDoc.baseline} (scripts/test-baseline.json), a drop of ${baselineDoc.baseline - currentCount}`)
  }

  const report = {
    pass: problems.length === 0,
    onlyCount: onlyHits.length,
    skipCount: skipHits.length,
    skipFloor,
    currentTestCount: currentCount,
    baseline: baselineDoc ? baselineDoc.baseline : null,
    problems,
  }
  fs.writeFileSync(path.join(GATE_DIR, 'report.json'), JSON.stringify(report, null, 2))
  process.stdout.write(JSON.stringify(report))
}

main()
