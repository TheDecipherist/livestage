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
  it('renders the current branch and last commit, using only git under the granted allowlist', () => {
    const out = render('codebase-health.stage')
    // No DIRECTIVE_RE check: "Last commit:" embeds the real commit subject
    // line verbatim, same reasoning as change-review.stage (this project's
    // history mentions directive names in prose). Confirmed with the user.
    expect(out).toContain('Branch:')
    expect(out).toContain('Last commit:')
    expect(out).toContain('Uncommitted files:')
  })
})

describe('change-review.stage: replaces git diff + git log + git status with one render', () => {
  it('renders a diff stat, recent commit list, and working tree status', () => {
    const out = render('change-review.stage')
    // No DIRECTIVE_RE check here: this example intentionally embeds
    // arbitrary git log text verbatim, and this project's own commit
    // history legitimately mentions directive names in prose (e.g. a
    // commit titled "@read-frontmatter honors visible=/silent="), which is
    // not a directive-syntax leak, just what git log actually said.
    // Confirmed with the user before touching this frozen test file.
    expect(out).toContain('Diff stat')
    expect(out).toContain('Recent commits')
    expect(out).toContain('Working tree status')
  })
})

describe('onboarding-brief.stage: replaces cat README + ls src + cat package.json with one render', () => {
  it('renders the sample project name, description, and source tree, fully self-contained (no jail escape needed)', () => {
    const out = render('onboarding-brief.stage')
    expect(out).not.toMatch(DIRECTIVE_RE)
    expect(out).toContain('sample-project')
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
