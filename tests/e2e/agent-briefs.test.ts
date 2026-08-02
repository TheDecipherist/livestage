import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Auto README Generation (feature 48): three real, runnable examples
// demonstrating the pattern the README itself argues for, replace N
// separate bash/git/grep/cat commands an agent would otherwise run and
// mentally merge, with one render that returns a finished status result.
const repoRoot = join(import.meta.dirname, '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')
const briefsDir = join(repoRoot, 'examples', 'agent-briefs')

const DIRECTIVE_RE = /(^|[^`\w])@[a-z][a-z-]*(\s|"|\/|$)/m

function render(file: string): string {
  return execFileSync('node', [cliEntry, 'render', file], { cwd: briefsDir, encoding: 'utf8' })
}

describe('examples/agent-briefs/ ships exactly the policy grant it needs', () => {
  it('grants only shell for git commands, no code/write access', () => {
    const policy = JSON.parse(readFileSync(join(briefsDir, '.livestage', 'policy.json'), 'utf8'))
    expect(policy.shell?.enabled).toBe(true)
    expect(policy.filesystem?.write_enabled).toBeFalsy()
    expect(policy.code?.languages ?? []).toEqual([])
  })
})

describe('codebase-health.stage: replaces git status + git log + branch check with one render', () => {
  it('renders the current branch and last commit, matching real independently-computed git output (not just static template text)', () => {
    const out = render('codebase-health.stage')
    // Checking for the literal static labels ("Branch:", "Last commit:")
    // alone would pass even if the @query calls returned nothing (a break
    // test proved this: forcing @query to return "" left every static
    // label test passing). Assert against real values computed
    // independently via a direct git call, so a broken @query pipeline
    // would actually fail this test.
    const realBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    expect(out).toContain(`Branch: ${realBranch}`)
    expect(out).toMatch(/Last commit: [0-9a-f]{7,} \S/)
  })
})

describe('change-review.stage: replaces git diff + git log + git status with one render', () => {
  it('renders a diff stat, recent commit list, and working tree status, matching real independently-computed git output', () => {
    const out = render('change-review.stage')
    // Same non-tautology fix as codebase-health.stage: assert the actual
    // current HEAD's short hash (computed independently) appears in the
    // recent-commits section, not just the static "Recent commits" label.
    const headShort = execFileSync('git', ['log', '-1', '--format=%h'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    expect(out).toContain('Diff stat')
    expect(out).toContain(headShort)
    expect(out).toContain('Working tree status')
  })
})

describe('onboarding-brief.stage: replaces cat README + ls src + cat package.json with one render', () => {
  it('renders the sample project name, description, and source tree, fully self-contained (no jail escape needed)', () => {
    const out = render('onboarding-brief.stage')
    expect(out).not.toMatch(DIRECTIVE_RE)
    // The interpolated heading and the fixture's distinctive description
    // text, not the bare string "sample-project" (which also appears in
    // this file's own static prose regardless of whether the @read calls
    // actually ran, a tautology a prior version of this test had).
    expect(out).toContain('## Onboarding Brief: sample-project')
    const fixturePkg = JSON.parse(readFileSync(join(briefsDir, 'sample-project', 'package.json'), 'utf8')) as { description: string }
    expect(out).toContain(fixturePkg.description)
    expect(out).toContain('index.ts')
    expect(out).toContain('utils.ts')
  })

  it('needs no .livestage/policy.json grant beyond the shared one (pure @read/@tree, no shell)', () => {
    // onboarding-brief.stage deliberately uses only filesystem reads (no
    // @query), proving the "zero shell grant needed" path the doc argues
    // for; codebase-health.stage and change-review.stage are the two that
    // actually need the shell.enabled grant, for git.
    const src = readFileSync(join(briefsDir, 'onboarding-brief.stage'), 'utf8')
    expect(src).not.toContain('@query')
  })
})
