#!/usr/bin/env node
// Regenerates every example's committed .md from its .stage source (see
// example-render-targets.mjs for the list). Mirrors `npm run readme`'s
// role for README.stage/README.md, generalized to N example pairs.
import { execFileSync } from 'node:child_process'
import { writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EXAMPLE_RENDER_TARGETS } from './example-render-targets.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')

if (!existsSync(cliEntry)) {
  console.error(`render-examples: ${cliEntry} not found. Run "npm run build" first.`)
  process.exit(2)
}

let failed = false
for (const { cwd, stage, md } of EXAMPLE_RENDER_TARGETS) {
  const fullCwd = join(repoRoot, cwd)
  try {
    const rendered = execFileSync('node', [cliEntry, 'render', stage], { cwd: fullCwd, encoding: 'utf8' })
    writeFileSync(join(fullCwd, md), rendered.trim() + '\n', 'utf8')
    console.log(`render-examples: wrote ${cwd}/${md}`)
  } catch (err) {
    failed = true
    console.error(`render-examples: FAILED rendering ${cwd}/${stage}:`)
    console.error(err.stderr || err.message)
  }
}
process.exit(failed ? 1 : 0)
