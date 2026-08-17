// Shared by render-examples.mjs and check-example-renders.mjs: workspace
// trust (see src/engine/security/config.ts) now gates a real policy.json's
// shell/code/http grants behind an explicit `livestage trust`. This
// project's own examples ship committed, reviewed policy.json grants
// specifically so a fresh clone can render and verify them immediately,
// so these two CI-facing scripts trust every example directory themselves,
// in an isolated, throwaway home directory, never the real developer
// machine's ~/.livestage/trust.json. That is a deliberate, explicit,
// scripted trust decision this repo makes about its own reviewed examples,
// not an inferred or silently-defaulted one: the same mechanism a human
// reviewer would use, run once, for a corpus this script's own maintainers
// already reviewed.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export async function trustAllExampleDirs(repoRoot, targets) {
  const { trustDirectory } = await import(pathToFileURL(join(repoRoot, 'dist', 'engine', 'security', 'trust.js')))
  const homeDir = mkdtempSync(join(tmpdir(), 'ls-examples-trust-'))
  const seen = new Set()
  for (const { cwd } of targets) {
    const fullCwd = join(repoRoot, cwd)
    if (seen.has(fullCwd)) continue
    seen.add(fullCwd)
    trustDirectory(fullCwd, homeDir)
  }
  return homeDir
}
