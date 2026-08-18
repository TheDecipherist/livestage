#!/usr/bin/env node
// Feature 48 (Auto README Generation): docs/directives.md is generated from
// directives.stage, never hand-edited. This check renders directives.stage fresh
// and compares it against the committed docs/directives.md, failing loudly if they
// differ, so a change that should have regenerated the README but didn't
// gets caught in CI instead of silently shipping a stale file.
//
// Deliberately non-mutating: unlike `npm run readme`, this never writes
// docs/directives.md itself, a "check" command that mutates the thing it checks is
// the wrong shape (same principle as scripts/check-test-baseline.mjs).

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { stripGeneratedMetadataBlock } from '../dist/engine/generated-metadata.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')
const readmePath = join(repoRoot, 'docs/directives.md')

if (!existsSync(cliEntry)) {
  console.error(`check-directives: ${cliEntry} not found. Run "npm run build" first.`)
  process.exit(2)
}
if (!existsSync(readmePath)) {
  console.error('check-directives: docs/directives.md does not exist. Run "npm run directives" first.')
  process.exit(2)
}

let rendered
try {
  rendered = execFileSync('node', [cliEntry, 'render', 'directives.stage'], { cwd: repoRoot, encoding: 'utf8' })
} catch (err) {
  // Distinct from "content differs" below: a render failure (parse error,
  // a security-blocked path, an unclosed directive) is a different problem
  // with a different fix than a stale-but-valid README, and deserves its
  // own message and exit code rather than an uncaught stack trace or a
  // misleading "FAIL, run npm run readme" pointing at the wrong fix.
  console.error('check-directives: RENDER FAILED. directives.stage did not render successfully:')
  console.error(err.stderr || err.message)
  process.exit(3)
}

// Sanity floor: the directive reference is one heading per doc that
// declares `primitives` in its frontmatter, plus the body of each one.
// If read_section() silently misses (a renamed "## Interface Overview"),
// the page renders with headings and no bodies, exit 0, content gone.
const lineCount = rendered.split('\n').length
const sectionCount = (rendered.match(/^## /gm) ?? []).length
if (lineCount < 300 || sectionCount < 6) {
  console.error(`check-directives: RENDER SUSPICIOUSLY SHORT (${lineCount} lines, ${sectionCount} "## " sections). A renamed heading or moved doc degrades to empty rather than erroring. Investigate before trusting the diff below.`)
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
  console.error('check-directives: FAIL. docs/directives.md is stale, it does not match what directives.stage currently renders. Run "npm run directives" to regenerate, then commit the result.')
  process.exit(1)
}
console.log('check-directives: OK. docs/directives.md matches directives.stage.')
