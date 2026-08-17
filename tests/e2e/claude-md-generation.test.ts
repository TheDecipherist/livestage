import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Auto CLAUDE.md Generation: CLAUDE.stage at the repo root renders itself
// into CLAUDE.md by reading the project's own state live (package.json,
// the real src/ tree, .mdd/waves/, examples/), the exact pattern feature 48
// established for README.stage/README.md, applied to the file every Claude
// Code session in this repo reads first. Found and fixed while building
// this: the "29 directives, as of this writing" and a stale donor-spec-path
// reference in the OLD hand-typed CLAUDE.md were both drift that nobody had
// caught.
const repoRoot = join(import.meta.dirname, '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')

function renderClaudeMd(): string {
  return execFileSync('node', [cliEntry, 'render', 'CLAUDE.stage'], { cwd: repoRoot, encoding: 'utf8' })
}

describe('CLAUDE.stage renders CLAUDE.md content live from the project itself', () => {
  it('needs no policy grant: every fact comes from @read/@list/@count, not shell', () => {
    // No .livestage/policy.json at the repo root at all (confirmed: this
    // mirrors README.stage's own deliberately policy-free posture), so a
    // clean render under the fully-default (deny-everything-but-filesystem)
    // policy is itself the proof.
    expect(existsSync(join(repoRoot, '.livestage', 'policy.json'))).toBe(false)
    const out = renderClaudeMd()
    expect(out).not.toContain('SECURITY_ALERT')
  })

  it('the directive count matches a live count of src/parser/directives/*.ts', () => {
    const real = execFileSync('bash', ['-c', 'ls src/parser/directives/*.ts | wc -l'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    const out = renderClaudeMd()
    expect(out).toContain(`${real} as of this render`)
  })

  it('the example count matches a live, recursive count of examples/**/*.stage', () => {
    const real = execFileSync('bash', ['-c', 'find examples -iname "*.stage" | wc -l'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    const out = renderClaudeMd()
    expect(out).toContain(`${real} of them at this render`)
  })

  it('package.json name/bin/node-engine are read live, not hardcoded', () => {
    const out = renderClaudeMd()
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
      name: string
      bin: Record<string, string>
      engines: { node: string }
    }
    expect(out).toContain(pkg.name)
    expect(out).toContain(pkg.bin[pkg.name])
    expect(out).toContain(pkg.engines.node)
  })

  it('every npm run script from package.json appears in the rendered Commands table', () => {
    const out = renderClaudeMd()
    const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    const missing = Object.keys(pkg.scripts).filter(name => !out.includes(name))
    expect(missing).toEqual([])
  })

  it('renderer formats and security files are listed live, matching the real directories', () => {
    const out = renderClaudeMd()
    for (const f of ['bar.ts', 'code.ts', 'table.ts', 'tree.ts']) {
      expect(out).toContain(`src/renderer/formats/${f}`)
    }
    for (const f of ['shell.ts', 'filesystem.ts', 'masking.ts']) {
      expect(out).toContain(`src/engine/security/${f}`)
    }
  })

  it('a value interpolated adjacent to backticks in the source does not silently vanish (regression)', () => {
    // Found while building this file: {{ pkg_name }}/{{ pkg_bin }} were
    // first drafted wrapped in backticks for styling, and scanInterpolations
    // deliberately skips {{ }} inside inline code spans (the same trap
    // fixed in examples/multi-step/index.stage), so both rendered as the
    // literal text "{{ pkg_name }}" / "{{ pkg_bin }}" instead of the real
    // values. CLAUDE.stage's own prose no longer wraps them; this asserts
    // the literal syntax never reappears if someone reintroduces it.
    const out = renderClaudeMd()
    expect(out).not.toContain('{{ pkg_name }}')
    expect(out).not.toContain('{{ pkg_bin }}')
  })
})

describe('npm run claude-md / claude-md:check regenerate CLAUDE.md via the existing build verb', () => {
  it('the "build -o" mechanism npm run claude-md uses writes output matching render CLAUDE.stage produces', () => {
    // Writes to a TEMP output path, never the tracked repo-root CLAUDE.md,
    // the same discipline readme-generation.test.ts's equivalent test
    // uses (a test must never mutate a git-tracked file as an
    // uncontrolled side effect of running).
    const scratchDir = join(repoRoot, '.ai_temp', 'claude-md-build-test')
    mkdirSync(scratchDir, { recursive: true })
    try {
      const outPath = join(scratchDir, 'OUT.md')
      execFileSync('node', [cliEntry, 'build', 'CLAUDE.stage', '-o', join('.ai_temp', 'claude-md-build-test', 'OUT.md')], { cwd: repoRoot, encoding: 'utf8' })
      const written = readFileSync(outPath, 'utf8')
      const rendered = renderClaudeMd()
      expect(written.trim()).toBe(rendered.trim())
    } finally {
      rmSync(scratchDir, { recursive: true, force: true })
    }
  })

  it('claude-md:check passes when the committed CLAUDE.md is current', () => {
    // Trusts the actual committed CLAUDE.md (this feature's own build
    // regenerated it for real via `npm run claude-md`, checked into this
    // branch) rather than regenerating it here, so this test never writes
    // to the tracked file either.
    const checkScript = join(repoRoot, 'scripts', 'check-claude-md.mjs')
    expect(() => execFileSync('node', [checkScript], { cwd: repoRoot, encoding: 'utf8' })).not.toThrow()
  })

  // No "claude-md:check FAILS when stale" test here (unlike
  // readme-generation.test.ts's equivalent): that test deliberately,
  // temporarily overwrites the real CLAUDE.md, and Vitest runs test files
  // in parallel by default -- a second file reading CLAUDE.md concurrently
  // (this file's own tests above) could catch it mid-mutation, the exact
  // race found and fixed in tests/e2e/all-examples-rendered.test.ts during
  // the examples:check rollout. check-claude-md.mjs shares its
  // implementation almost verbatim with check-readme.mjs, whose own
  // staleness-proof test already covers this logic; not vacuous.
})
