#!/usr/bin/env node
// Feature 48 (Auto README Generation): README.md is generated from
// README.stage, never hand-edited. This check renders README.stage fresh
// and compares it against the committed README.md, failing loudly if they
// differ, so a change that should have regenerated the README but didn't
// gets caught in CI instead of silently shipping a stale file.
//
// Deliberately non-mutating: unlike `npm run readme`, this never writes
// README.md itself, a "check" command that mutates the thing it checks is
// the wrong shape (same principle as scripts/check-test-baseline.mjs).

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { stripGeneratedMetadataBlock } from '../dist/engine/generated-metadata.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')
const readmePath = join(repoRoot, 'README.md')

if (!existsSync(cliEntry)) {
  console.error(`check-readme: ${cliEntry} not found. Run "npm run build" first.`)
  process.exit(2)
}
if (!existsSync(readmePath)) {
  console.error('check-readme: README.md does not exist. Run "npm run readme" first.')
  process.exit(2)
}

let rendered
try {
  rendered = execFileSync('node', [cliEntry, 'render', 'README.stage'], { cwd: repoRoot, encoding: 'utf8' })
} catch (err) {
  // Distinct from "content differs" below: a render failure (parse error,
  // a security-blocked path, an unclosed directive) is a different problem
  // with a different fix than a stale-but-valid README, and deserves its
  // own message and exit code rather than an uncaught stack trace or a
  // misleading "FAIL, run npm run readme" pointing at the wrong fix.
  console.error('check-readme: RENDER FAILED. README.stage did not render successfully:')
  console.error(err.stderr || err.message)
  process.exit(3)
}

// Cheap sanity floor against a silent under-render (a directive that
// degrades to empty on a missing/renamed target, e.g. read_section() on a
// renamed heading, produces exit 0 with quietly-dropped content, not an
// error).
//
// This floor used to count "### " headings and require 8+. Those headings
// were the inline directive reference, which now lives in
// docs/directives.md and is guarded by scripts/check-directives.mjs. What
// is left in the README that can still silently vanish is the live-read
// content: the four ```stage fences (the minimal example plus the three
// agent briefs, each read from its real source file) and the round-trip
// table read from benchmarks/roundtrip.json. Those are what this guards.
// All three thresholds sit well below the real numbers, this is a coarse
// alarm for "most of the content silently vanished," not a precise check.
const lineCount = rendered.split('\n').length
const stageFences = (rendered.match(/^```stage$/gm) ?? []).length
const hasRoundTrip = /\|\s*scenario\s*\|/.test(rendered)
if (lineCount < 250 || stageFences < 4 || !hasRoundTrip) {
  console.error(`check-readme: RENDER SUSPICIOUSLY SHORT (${lineCount} lines, ${stageFences} stage fences, round-trip table ${hasRoundTrip ? 'present' : 'MISSING'}). This usually means a directive silently degraded to empty (a renamed heading, a moved file) rather than a real, complete render. Investigate before trusting the diff below.`)
  process.exit(3)
}

// Part 5 (feat/drift-gates): npm run readme stamps a livestage:generated
// metadata block (source, timestamp, version, content hash) that a bare
// `render` (used above for the comparison) never produces, so it's
// stripped from the committed side before comparing content. The block
// itself carries a live timestamp on every regeneration by design (Part
// 5.1), it is never expected to be byte-stable, that is not what this
// check is for.
const committed = stripGeneratedMetadataBlock(readFileSync(readmePath, 'utf8'))
const normalize = s => s.trim() + '\n'
if (normalize(committed) !== normalize(rendered)) {
  console.error('check-readme: FAIL. README.md is stale, it does not match what README.stage currently renders. Run "npm run readme" to regenerate, then commit the result.')
  process.exit(1)
}
console.log('check-readme: OK. README.md matches README.stage.')
