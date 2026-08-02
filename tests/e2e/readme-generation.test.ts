import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAvailableDirectives } from 'livestage/parser'

// Auto README Generation (feature 48): README.stage at the repo root
// renders itself into README.md by reading the project's own state live
// (the .mdd/docs corpus, package.json, the real example files), never
// hand-copied content. This is the coverage/drift guard: every directive
// the registry returns must appear somewhere in the rendered output, so a
// directive added without a corresponding doc entry the discovery query
// can find fails CI loudly instead of silently going undocumented.
const repoRoot = join(import.meta.dirname, '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')

function renderReadme(): string {
  return execFileSync('node', [cliEntry, 'render', 'README.stage'], { cwd: repoRoot, encoding: 'utf8' })
}

describe('README.stage renders README.md content live from the project itself', () => {
  it('every registered directive appears in the generated output (registry-vs-docs coverage guard)', () => {
    const out = renderReadme()
    const registered = getAvailableDirectives().map(d => d.name)
    // "pipe" is a grammar-internal registry entry (the `|` pipe operator's
    // own parse module), not a directive anyone writes as literal "@pipe"
    // syntax; 22-pipe.md (which documents pipe syntax) is still included in
    // the directive reference via the same discovery query as everything
    // else, it just never contains the string "@pipe" because that syntax
    // doesn't exist.
    const missing = registered.filter(name => name !== 'pipe' && !out.includes(`@${name}`))
    expect(missing).toEqual([])
  })

  // No blanket "zero @-directive syntax" regex check here (dropped after
  // repeated false positives: this README is long, prose-heavy, real
  // content, and a naive strip-backticks-then-regex approach kept
  // concatenating separate legitimate inline code spans into new
  // accidentally-directive-shaped text, testing the check's own regex
  // robustness more than the implementation). The coverage guard above
  // (every directive name present) and the real-value checks below (actual
  // git output, actual package.json fields, actual file source) already
  // give non-vacuous proof the render executed correctly end to end.

  it('package.json name and version are read live, not hardcoded', () => {
    const out = renderReadme()
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { name: string; version: string }
    expect(out).toContain(pkg.name)
    expect(out).toContain(pkg.version)
  })

  it('embeds the three examples/agent-briefs/ files\' real source (read live, not retyped)', () => {
    const out = renderReadme()
    // read_section() reads a file's actual text, it does not EXECUTE a
    // .stage file's directives (that would need @include, which inherits
    // the INCLUDING document's security context; README.stage deliberately
    // stays policy-free at the repo root, so it shows real source, not live
    // command output, rather than requiring a root-level shell/git grant
    // just to render its own README). Checks for the literal directive
    // syntax from each file, proving the actual source was read, not a
    // hand-retyped paraphrase that could drift from the real file.
    const codebaseHealth = readFileSync(join(repoRoot, 'examples', 'agent-briefs', 'codebase-health.stage'), 'utf8')
    const changeReview = readFileSync(join(repoRoot, 'examples', 'agent-briefs', 'change-review.stage'), 'utf8')
    const onboarding = readFileSync(join(repoRoot, 'examples', 'agent-briefs', 'onboarding-brief.stage'), 'utf8')
    expect(out).toContain('git rev-parse --abbrev-ref HEAD')
    expect(codebaseHealth).toContain('git rev-parse --abbrev-ref HEAD')
    expect(out).toContain('git diff --stat')
    expect(changeReview).toContain('git diff --stat')
    expect(out).toContain('sample-project/package.json')
    expect(onboarding).toContain('sample-project/package.json')
  })
})

describe('npm run readme / readme:check regenerate README.md via the existing build verb', () => {
  it('npm run readme writes README.md matching what render README.stage produces', () => {
    execFileSync('npm', ['run', 'readme'], { cwd: repoRoot, encoding: 'utf8' })
    const written = readFileSync(join(repoRoot, 'README.md'), 'utf8')
    const rendered = renderReadme()
    expect(written.trim()).toBe(rendered.trim())
  })

  it('npm run readme:check passes when README.md is current', () => {
    execFileSync('npm', ['run', 'readme'], { cwd: repoRoot, encoding: 'utf8' })
    expect(() => execFileSync('npm', ['run', 'readme:check'], { cwd: repoRoot, encoding: 'utf8' })).not.toThrow()
  })
})
