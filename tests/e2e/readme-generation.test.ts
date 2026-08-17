import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getAvailableDirectives } from 'livestage/parser'
import { stripGeneratedMetadataBlock } from '../../src/engine/generated-metadata.js'

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

// The doc-owner-per-directive mapping is a fixed, known set: each doc that
// declares a non-empty `primitives` frontmatter field owns one or more
// directives' (or pipe builtins') Interface Overview. 27-assert-liveness
// (a validate-time check on @assert, owned by 26) and 36-frontmatter-query
// (a where=/fields= extension of @list, owned by 17) document behavior of
// an existing primitive rather than introducing a new one, so neither
// declares its own `primitives` entry.
const EXPECTED_DIRECTIVE_DOCS = [
  '17-source-directives', '18-compute-directives', '19-composition-directives',
  '20-render-formats', '22-pipe', '26-assert-operators',
  '29-code-runners', '33-update-frontmatter', '34-graph',
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

  it('does not claim the seeded default is shell-off or "nothing runs by default" (18-compute-directives B2)', () => {
    // Found during a pre-launch review: the @query section's own prose
    // said "nothing runs by default," false against the real shipped
    // defaultSecurityConfig() (shell.enabled: true, ~40 read-only
    // patterns granted out of the box). Guards against the claim
    // reappearing anywhere in the generated README.
    const out = renderReadme()
    expect(out).not.toMatch(/nothing runs by default/i)
    expect(out).not.toMatch(/nothing is granted beyond that/i)
  })

  it('the test-count header line reads as a floor ("N+ tests"), not an exact count', () => {
    // Found during the same review: scripts/test-baseline.json's number
    // is a reviewed floor (CR-7), not the live suite count, and was
    // rendered without any indication of that, reading as an exact,
    // stale count.
    const out = renderReadme()
    expect(out).toMatch(/\*\*\d+\+ tests\*\*/)
  })

  it('the "Drift? What\'s that?" section\'s module/directive/example counts match live, independently-computed values', () => {
    const out = renderReadme()
    const moduleCount = execFileSync('bash', ['-c', 'find src -maxdepth 1 -mindepth 1 -type d | wc -l'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    const directiveCount = execFileSync('bash', ['-c', 'ls src/parser/directives/*.ts | wc -l'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    const exampleCount = execFileSync('bash', ['-c', 'find examples -iname "*.stage" | wc -l'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    expect(out).toContain(`computes ${moduleCount} modules, ${directiveCount} directives`)
    expect(out).toContain(`${exampleCount} worked examples`)
    // Regression: {{ }} interpolated adjacent to backticks silently
    // vanishes (scanInterpolations skips inline code spans), the exact
    // bug found live while building CLAUDE.stage and referenced in this
    // section's own prose. None of this section's computed values are
    // backtick-wrapped; confirm the literal syntax never leaks through.
    expect(out).not.toMatch(/`\{\{\s*cmd_\w+\s*\}\}`/)
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

const checkReadmeScript = join(repoRoot, 'scripts', 'check-readme.mjs')

function runCheckReadme(): void {
  execFileSync('node', [checkReadmeScript], { cwd: repoRoot, encoding: 'utf8' })
}

describe('npm run readme / readme:check regenerate README.md via the existing build verb', () => {
  it('the "build -o" mechanism npm run readme uses writes output matching render README.stage produces', () => {
    // Writes to a TEMP output path, never the tracked repo-root README.md.
    // A test must not mutate a git-tracked file as a side effect of
    // running: the original version of this test called `npm run readme`
    // directly against repoRoot, which regenerates the REAL README.md.
    // Since `npm test` runs before `npm run readme:check` in CI
    // (.github/workflows/ci.yml), that meant the test suite silently
    // "fixed" any drift in README.md before the drift-check step ever ran,
    // making the whole CI gate this feature exists to add vacuous, found
    // live via independent review, confirmed by reading the CI step order.
    // `@build`'s write jail confines output to inside the project root
    // (write_root defaults to "cwd"), so the temp output goes under the
    // repo's own .ai_temp/ (already gitignored) rather than the OS tmpdir,
    // which `@build` correctly refuses as outside the write jail.
    const scratchDir = join(repoRoot, '.ai_temp', 'readme-build-test')
    mkdirSync(scratchDir, { recursive: true })
    try {
      const outPath = join(scratchDir, 'OUT.md')
      execFileSync('node', [cliEntry, 'build', 'README.stage', '-o', join('.ai_temp', 'readme-build-test', 'OUT.md')], { cwd: repoRoot, encoding: 'utf8' })
      const written = readFileSync(outPath, 'utf8')
      const rendered = renderReadme()
      expect(written.trim()).toBe(rendered.trim())
    } finally {
      rmSync(scratchDir, { recursive: true, force: true })
    }
  })

  it('readme:check passes when the committed README.md is current', () => {
    // Trusts the actual committed README.md (this feature's own build
    // regenerated it for real via `npm run readme`, and it is checked into
    // this branch) rather than regenerating it here, so this test never
    // writes to the tracked file either.
    expect(runCheckReadme).not.toThrow()
  })

  it('readme:check FAILS when README.md is stale (proves the check is not vacuous)', () => {
    const readmePath = join(repoRoot, 'README.md')
    const original = readFileSync(readmePath, 'utf8')
    try {
      writeFileSync(readmePath, 'deliberately stale content for this test\n')
      expect(runCheckReadme).toThrow()
    } finally {
      writeFileSync(readmePath, original)
    }
  })
})

// feat/drift-gates, Part 2: scripts/verify-generated.mjs is what
// .githooks/pre-commit and pre-push actually run. Co-located here (not a
// new test file) deliberately: it mutates the same tracked README.md this
// file's own vacuousness proof above already does, and vitest runs test
// FILES in parallel by default, a second file doing the same mutation
// against the same real path risks catching this one mid-mutation (the
// documented examples:check gotcha in CLAUDE.md). Same file, same
// synchronous mutate/act/restore boundary, no new collision surface.
describe('scripts/verify-generated.mjs (what the git hooks actually run)', () => {
  const verifyGeneratedScript = join(repoRoot, 'scripts', 'verify-generated.mjs')

  it('passes silently (exit 0) when README.md, CLAUDE.md, and examples are all current', () => {
    const out = execFileSync('node', [verifyGeneratedScript], { cwd: repoRoot, encoding: 'utf8' })
    expect(out).toContain('OK readme')
    expect(out).toContain('all generated files current')
  })

  it('FAILS with the exact fix command when README.md is stale, proving the gate is not vacuous', () => {
    const readmePath = join(repoRoot, 'README.md')
    const original = readFileSync(readmePath, 'utf8')
    try {
      writeFileSync(readmePath, 'deliberately stale content for this test\n')
      expect(() => execFileSync('node', [verifyGeneratedScript], { cwd: repoRoot, encoding: 'utf8' })).toThrow()
      let output = ''
      try {
        execFileSync('node', [verifyGeneratedScript], { cwd: repoRoot, encoding: 'utf8' })
      } catch (err) {
        output = String((err as { stdout?: string }).stdout ?? '') + String((err as { stderr?: string }).stderr ?? '')
      }
      expect(output).toContain('FAIL readme')
      expect(output).toContain('npm run readme && git add README.md')
    } finally {
      writeFileSync(readmePath, original)
    }
  })

  it('--fix regenerates and re-stages a stale README.md instead of failing (design decision: check-and-fail is the DEFAULT, --fix is the explicit opt-in)', () => {
    const readmePath = join(repoRoot, 'README.md')
    const original = readFileSync(readmePath, 'utf8')
    try {
      writeFileSync(readmePath, 'deliberately stale content for this test\n')
      const out = execFileSync('node', [verifyGeneratedScript, '--fix'], { cwd: repoRoot, encoding: 'utf8' })
      expect(out).toContain('regenerating (--fix)')
      expect(out).toContain('regenerated and staged README.md')
      const fixed = readFileSync(readmePath, 'utf8')
      // Compare with the metadata block stripped, not the raw bytes: every
      // regeneration stamps a fresh livestage_updated_at (wall-clock, at
      // the moment --fix ran), so a byte-for-byte compare against the
      // pre-test committed file fails on the timestamp alone even when the
      // actual rendered content is identical, the same reason
      // check-readme.mjs itself strips this block before comparing.
      expect(stripGeneratedMetadataBlock(fixed)).toBe(stripGeneratedMetadataBlock(original))
      // --fix stages the regenerated file via `git add`, since the whole
      // point of check-and-fail-by-default is that a generated file never
      // enters a commit silently; --fix still leaves a normal, visible,
      // reviewable staged diff for the author to look at before committing.
      // The regenerated content happens to round-trip back to exactly what
      // HEAD already has content-wise (this test's "stale" content was
      // synthetic, not a real drift), so `git diff --cached` is empty by
      // correct git behavior, not a sign staging didn't happen: check the
      // INDEX (staged) blob directly instead.
      const stagedBlob = execFileSync('git', ['show', ':README.md'], { cwd: repoRoot, encoding: 'utf8' })
      expect(stripGeneratedMetadataBlock(stagedBlob)).toBe(stripGeneratedMetadataBlock(original))
    } finally {
      execFileSync('git', ['reset', 'README.md'], { cwd: repoRoot })
      writeFileSync(readmePath, original)
    }
  })
})
