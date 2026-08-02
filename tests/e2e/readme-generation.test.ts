import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

// The doc-owner-per-directive mapping is a fixed, known set (each directive
// belongs to exactly one owning doc's API/Interface, per the project's own
// build docs); "pipe" is the one registry entry with no owning doc of its
// own (a grammar-internal parse module for the `|` operator, not a
// directive anyone writes as literal "@pipe" syntax).
const EXPECTED_DIRECTIVE_DOCS = [
  '17-source-directives', '18-compute-directives', '19-composition-directives',
  '20-render-formats', '22-pipe', '26-assert-operators', '27-assert-liveness',
  '29-code-runners', '33-update-frontmatter', '34-graph', '36-frontmatter-query',
]

describe('README.stage renders README.md content live from the project itself', () => {
  it('the discovery query returns exactly the doc set that covers every registered directive', () => {
    // Runs the EXACT query line from README.stage (extracted, not
    // hand-copied, so this can't silently drift from the real filter)
    // standalone, and asserts the precise doc-id set it returns. A softer
    // "does @name appear anywhere in the rendered output" check was tried
    // first and proved vacuous: even with a doc's path deliberately broken
    // so the query excludes it, OTHER docs' cross-referencing prose (e.g.
    // "ungranted @code language" in 27-assert-liveness) still mentioned the
    // directive's name, masking the gap. This checks the query's own
    // correctness directly, not a string search over unrelated prose.
    const source = readFileSync(join(repoRoot, 'README.stage'), 'utf8')
    const queryLine = source.split('\n').find(l => l.startsWith('@foreach docid in @list'))
    expect(queryLine, 'could not find the discovery query line in README.stage').toBeDefined()
    const listCall = queryLine!.replace(/^@foreach docid in /, '')

    const dir = mkdtempSync(join(tmpdir(), 'ls-readme-query-'))
    try {
      writeFileSync(join(dir, 'query.stage'), `${listCall} | @render type="list" /\n`)
      execFileSync('cp', ['-r', join(repoRoot, '.mdd'), dir])
      const out = execFileSync('node', [cliEntry, 'render', 'query.stage'], { cwd: dir, encoding: 'utf8' })
      // "id" is the fields= header row, real README.stage skips it via
      // `@if docid != "id"` inside the @foreach body; filtered the same
      // way here since this test pipes straight to @render instead.
      const foundIds = out.split('\n').map(l => l.replace(/^- /, '').trim()).filter(v => v && v !== 'id').sort()
      expect(foundIds).toEqual([...EXPECTED_DIRECTIVE_DOCS].sort())
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('every registered directive appears in the generated output (loose sanity check)', () => {
    const out = renderReadme()
    const registered = getAvailableDirectives().map(d => d.name)
    const missing = registered.filter(name => name !== 'pipe' && !out.includes(`@${name}`))
    expect(missing).toEqual([])
  })

  // No blanket "zero @-directive syntax" regex check here (dropped after
  // repeated false positives: this README is long, prose-heavy, real
  // content, and a naive strip-backticks-then-regex approach kept
  // concatenating separate legitimate inline code spans into new
  // accidentally-directive-shaped text, testing the check's own regex
  // robustness more than the implementation). The doc-set check above is
  // the real, non-vacuous coverage guard; the loose check and the
  // real-value checks below give additional non-vacuous proof the render
  // executed correctly end to end.

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
