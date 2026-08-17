import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, chmodSync, copyFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// feat/drift-gates, Part 2/4: proves core.hooksPath + the committed
// .githooks/ directory actually wires into real git commit/push
// behavior, not just that scripts/verify-generated.mjs works when run
// directly (covered in readme-generation.test.ts). A scratch git repo,
// never the real one, since this exercises actual git commit/push
// plumbing, not something to risk against real history.
const repoRoot = join(import.meta.dirname, '..', '..')

function scratchGitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ls-githooks-'))
  execFileSync('git', ['init', '-q'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir })
  return dir
}

describe('.githooks/ wiring (core.hooksPath actually fires on commit/push)', () => {
  it('setup.sh sets core.hooksPath to .githooks', () => {
    const dir = scratchGitRepo()
    try {
      mkdirSync(join(dir, '.githooks'), { recursive: true })
      copyFileSync(join(repoRoot, '.githooks', 'setup.sh'), join(dir, '.githooks', 'setup.sh'))
      copyFileSync(join(repoRoot, '.githooks', 'pre-commit'), join(dir, '.githooks', 'pre-commit'))
      copyFileSync(join(repoRoot, '.githooks', 'pre-push'), join(dir, '.githooks', 'pre-push'))
      execFileSync('bash', ['.githooks/setup.sh'], { cwd: dir })
      const configured = execFileSync('git', ['config', 'core.hooksPath'], { cwd: dir, encoding: 'utf8' }).trim()
      expect(configured).toBe('.githooks')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a pre-commit hook wired via core.hooksPath actually blocks `git commit`, not just the script it calls', () => {
    const dir = scratchGitRepo()
    try {
      mkdirSync(join(dir, '.githooks'), { recursive: true })
      // A minimal stand-in pre-commit that always refuses, proving the
      // WIRING (git actually invokes core.hooksPath/pre-commit before
      // writing the commit), independent of verify-generated.mjs's own
      // logic (already covered elsewhere).
      writeFileSync(join(dir, '.githooks', 'pre-commit'), '#!/usr/bin/env bash\necho "blocked by test hook"\nexit 1\n')
      chmodSync(join(dir, '.githooks', 'pre-commit'), 0o755)
      execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: dir })

      writeFileSync(join(dir, 'file.txt'), 'content\n')
      execFileSync('git', ['add', 'file.txt'], { cwd: dir })

      let threw = false
      try {
        execFileSync('git', ['commit', '-m', 'should be blocked'], { cwd: dir, encoding: 'utf8' })
      } catch (err) {
        threw = true
        const output = String((err as { stdout?: string }).stdout ?? '') + String((err as { stderr?: string }).stderr ?? '')
        expect(output).toContain('blocked by test hook')
      }
      expect(threw).toBe(true)

      // No commit exists at all yet (HEAD has no history), the blocked
      // attempt above never wrote one: `git log` itself errors rather
      // than returning empty output on a branch with zero commits.
      expect(() => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' })).toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the REAL .githooks/pre-commit (copied verbatim) blocks a commit that stages a stale README.md-shaped check failure', () => {
    // Full integration: copies this repo's actual .githooks/pre-commit and
    // scripts/verify-generated.mjs into a scratch repo that mimics just
    // enough of the real repo's shape (a package.json with the same
    // check-script names, wired to always fail) to prove the REAL hook
    // file, unmodified, correctly aborts a commit.
    const dir = scratchGitRepo()
    try {
      mkdirSync(join(dir, '.githooks'), { recursive: true })
      mkdirSync(join(dir, 'scripts'), { recursive: true })
      copyFileSync(join(repoRoot, '.githooks', 'pre-commit'), join(dir, '.githooks', 'pre-commit'))
      chmodSync(join(dir, '.githooks', 'pre-commit'), 0o755)
      copyFileSync(join(repoRoot, 'scripts', 'verify-generated.mjs'), join(dir, 'scripts', 'verify-generated.mjs'))
      // A dist/cli/cli.js stand-in so verify-generated.mjs skips its own
      // "build first" branch, and package.json scripts that always fail
      // the check (proving the FAIL path propagates through the real,
      // unmodified pre-commit file).
      mkdirSync(join(dir, 'dist', 'cli'), { recursive: true })
      writeFileSync(join(dir, 'dist', 'cli', 'cli.js'), '')
      writeFileSync(join(dir, 'package.json'), JSON.stringify({
        name: 'scratch', version: '0.0.0',
        scripts: {
          'readme:check': 'node -e "console.error(\'stale\'); process.exit(1)"',
          'claude-md:check': 'node -e "process.exit(0)"',
          'examples:check': 'node -e "process.exit(0)"',
        },
      }))
      execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: dir })
      execFileSync('git', ['add', '-A'], { cwd: dir })
      execFileSync('git', ['commit', '-m', 'scratch setup', '--no-verify'], { cwd: dir })

      writeFileSync(join(dir, 'README.md'), 'anything\n')
      execFileSync('git', ['add', 'README.md'], { cwd: dir })

      let threw = false
      try {
        execFileSync('git', ['commit', '-m', 'should be blocked by the real pre-commit'], { cwd: dir, encoding: 'utf8' })
      } catch {
        threw = true
      }
      expect(threw).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
