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

const rendered = execFileSync('node', [cliEntry, 'render', 'README.stage'], { cwd: repoRoot, encoding: 'utf8' })
const committed = readFileSync(readmePath, 'utf8')

const normalize = s => s.trim() + '\n'
if (normalize(committed) !== normalize(rendered)) {
  console.error('check-readme: FAIL. README.md is stale, it does not match what README.stage currently renders. Run "npm run readme" to regenerate, then commit the result.')
  process.exit(1)
}
console.log('check-readme: OK. README.md matches README.stage.')
