#!/usr/bin/env node
// Shared by .githooks/pre-commit and .githooks/pre-push (and runnable
// directly): readme:check / claude-md:check / examples:check, with an
// opt-in --fix that regenerates and stages instead of just failing.
//
// Design decision (Part 2, feat/drift-gates): check-and-fail is the
// default, not regenerate-and-stage. Auto-regenerating and silently
// staging the result guarantees the commit's generated files are
// current, but it also means content enters the commit that the author
// never looked at, exactly the kind of silent change this project's own
// CLAUDE.md opens by arguing against (the /init snapshot that went stale
// and was never regenerated, found only because someone happened to grep
// for it). A hook's job here is to stop a bad commit from being WRITTEN,
// not to quietly rewrite it into a good one on the author's behalf.
// --fix exists for when the author explicitly wants the regeneration
// done, so it can be reviewed and staged as a normal, visible diff
// before the commit is finalized, never as the hook's own default.
//
// Neither this script nor the hooks that call it make anything
// "literally always" true. CI (.github/workflows/ci.yml) is the real
// gate; this exists to stop a stale commit being written in the first
// place, and is bypassable with --no-verify like any git hook.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const fix = process.argv.includes('--fix')

const CHECKS = [
  { name: 'readme', check: 'readme:check', fixCmd: 'readme', fixPaths: ['README.md'] },
  { name: 'claude-md', check: 'claude-md:check', fixCmd: 'claude-md', fixPaths: ['CLAUDE.md'] },
  { name: 'examples', check: 'examples:check', fixCmd: 'examples:render', fixPaths: ['examples/'] },
]

function run(cmd, args) {
  return execFileSync(cmd, args, { cwd: repoRoot, encoding: 'utf8' })
}

function runCapturing(cmd, args) {
  try {
    return { ok: true, output: run(cmd, args) }
  } catch (err) {
    const output = [err.stdout, err.stderr].filter(Boolean).join('\n') || err.message
    return { ok: false, output }
  }
}

const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')
if (!existsSync(cliEntry)) {
  console.log('verify-generated: building first (dist/cli/cli.js missing)...')
  const built = runCapturing('npm', ['run', 'build'])
  if (!built.ok) {
    console.error('verify-generated: build failed, cannot check generated files.')
    console.error(built.output)
    process.exit(1)
  }
}

let failed = false
for (const c of CHECKS) {
  const result = runCapturing('npm', ['run', c.check])
  if (result.ok) {
    console.log(`verify-generated: OK ${c.name}`)
    continue
  }
  if (fix) {
    console.log(`verify-generated: ${c.name} stale, regenerating (--fix)...`)
    const regen = runCapturing('npm', ['run', c.fixCmd])
    if (!regen.ok) {
      failed = true
      console.error(`verify-generated: --fix failed for ${c.name}`)
      console.error(regen.output)
      continue
    }
    run('git', ['add', ...c.fixPaths])
    console.log(`verify-generated: regenerated and staged ${c.fixPaths.join(', ')}`)
  } else {
    failed = true
    console.error(`verify-generated: FAIL ${c.name}`)
    console.error(result.output.trim())
    console.error(`  Fix: npm run ${c.fixCmd} && git add ${c.fixPaths.join(' ')}`)
    console.error(`  Or:  node scripts/verify-generated.mjs --fix`)
  }
}

if (failed) {
  console.error('\nverify-generated: one or more generated files are stale. Commit blocked.')
  process.exit(1)
}
console.log('verify-generated: all generated files current.')
