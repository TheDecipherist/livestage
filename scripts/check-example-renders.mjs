#!/usr/bin/env node
// Bug B1 (feature 51 / feature 48, 2026-08-17): example .stage files ship a
// committed .md rendering so a reader can see the result without cloning,
// building, and running the CLI. This check renders each example fresh and
// compares it against the committed .md, failing loudly if they differ, the
// same role scripts/check-readme.mjs plays for the top-level README, and
// wired into CI right alongside it.
//
// Deliberately non-mutating: unlike render-examples.mjs, this never writes
// the .md itself (same principle as check-readme.mjs and
// scripts/check-test-baseline.mjs: a "check" that mutates the thing it
// checks is the wrong shape and can silently defeat its own CI gate, see
// 48-auto-readme-generation's known_issues for exactly that failure mode
// happening once already with README.md).

import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EXAMPLE_RENDER_TARGETS } from './example-render-targets.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')

if (!existsSync(cliEntry)) {
  console.error(`check-example-renders: ${cliEntry} not found. Run "npm run build" first.`)
  process.exit(2)
}

const normalize = s => s.trim() + '\n'
let failed = false

for (const { cwd, stage, md } of EXAMPLE_RENDER_TARGETS) {
  const fullCwd = join(repoRoot, cwd)
  const mdPath = join(fullCwd, md)
  const label = `${cwd}/${md}`

  if (!existsSync(mdPath)) {
    console.error(`check-example-renders: FAIL. ${label} does not exist. Run "npm run examples:render" first.`)
    failed = true
    continue
  }

  let rendered
  try {
    rendered = execFileSync('node', [cliEntry, 'render', stage], { cwd: fullCwd, encoding: 'utf8' })
  } catch (err) {
    console.error(`check-example-renders: RENDER FAILED for ${cwd}/${stage}:`)
    console.error(err.stderr || err.message)
    failed = true
    continue
  }

  const committed = readFileSync(mdPath, 'utf8')
  if (normalize(committed) !== normalize(rendered)) {
    console.error(`check-example-renders: FAIL. ${label} is stale, it does not match what ${stage} currently renders. Run "npm run examples:render" to regenerate, then commit the result.`)
    failed = true
  }
}

if (failed) process.exit(1)
console.log(`check-example-renders: OK. ${EXAMPLE_RENDER_TARGETS.length} example(s) match their committed .md.`)
