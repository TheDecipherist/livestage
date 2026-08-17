#!/usr/bin/env node
// Feature: Auto CLAUDE.md Generation. CLAUDE.md is generated from
// CLAUDE.stage, never hand-edited, the same pattern feature 48 established
// for README.stage/README.md. This check renders CLAUDE.stage fresh and
// compares it against the committed CLAUDE.md, failing loudly if they
// differ, so a change that should have regenerated CLAUDE.md but didn't
// gets caught in CI instead of silently shipping a stale file, the exact
// file every session reads first.
//
// Deliberately non-mutating: unlike `npm run claude-md`, this never writes
// CLAUDE.md itself, a "check" command that mutates the thing it checks is
// the wrong shape (same principle as scripts/check-readme.mjs and
// scripts/check-test-baseline.mjs).

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')
const claudeMdPath = join(repoRoot, 'CLAUDE.md')

if (!existsSync(cliEntry)) {
  console.error(`check-claude-md: ${cliEntry} not found. Run "npm run build" first.`)
  process.exit(2)
}
if (!existsSync(claudeMdPath)) {
  console.error('check-claude-md: CLAUDE.md does not exist. Run "npm run claude-md" first.')
  process.exit(2)
}

let rendered
try {
  rendered = execFileSync('node', [cliEntry, 'render', 'CLAUDE.stage'], { cwd: repoRoot, encoding: 'utf8' })
} catch (err) {
  console.error('check-claude-md: RENDER FAILED. CLAUDE.stage did not render successfully:')
  console.error(err.stderr || err.message)
  process.exit(3)
}

// Same coarse floor as check-readme.mjs: catches a directive silently
// degrading to empty (a renamed path, a moved directory) rather than
// erroring, which would otherwise produce a short-but-valid-looking file.
const lineCount = rendered.split('\n').length
const sectionCount = (rendered.match(/^## /gm) ?? []).length
if (lineCount < 100 || sectionCount < 6) {
  console.error(`check-claude-md: RENDER SUSPICIOUSLY SHORT (${lineCount} lines, ${sectionCount} "## " sections). This usually means a directive silently degraded to empty (a renamed path, a moved directory) rather than a real, complete render. Investigate before trusting the diff below.`)
  process.exit(3)
}

const committed = readFileSync(claudeMdPath, 'utf8')
const normalize = s => s.trim() + '\n'
if (normalize(committed) !== normalize(rendered)) {
  console.error('check-claude-md: FAIL. CLAUDE.md is stale, it does not match what CLAUDE.stage currently renders. Run "npm run claude-md" to regenerate, then commit the result.')
  process.exit(1)
}
console.log('check-claude-md: OK. CLAUDE.md matches CLAUDE.stage.')
