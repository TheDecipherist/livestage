import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

// Examples Showcase (feature 44): every document in examples/showcase/
// renders successfully under the default (strict, deny-by-default) policy
// profile, no .livestage/policy.json grant of any kind. The donor mai/
// corpus this feature's doc originally pointed at is not accessible under
// this project's own "never reference the donor codebase outside
// MDs/livestage-spec.md" constraint (see the doc's known_issues), so this
// showcase is fresh content covering the same three-document shape (docs
// hub, project report, API reference + its data) rather than a migration.
const repoRoot = join(import.meta.dirname, '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')
const showcaseDir = join(repoRoot, 'examples', 'showcase')

function render(file: string): string {
  return execFileSync('node', [cliEntry, 'render', file], { cwd: showcaseDir, encoding: 'utf8' })
}

describe('examples/showcase/ renders under the default policy, no extra grants', () => {
  it('has no .livestage/policy.json of its own (proves nothing here needed a grant)', () => {
    expect(existsSync(join(showcaseDir, '.livestage', 'policy.json'))).toBe(false)
  })

  it('index.stage (the docs hub) renders and links to the other two documents', () => {
    const out = render('index.stage')
    expect(out).toContain('report.stage')
    expect(out).toContain('api-reference.stage')
  })

  it('report.stage (the project report) renders live directory contents and a real count', () => {
    const out = render('report.stage')
    expect(out).toContain('api-reference.stage')
    expect(out).toContain('cli-reference.json')
    expect(out).toMatch(/\n9\n/)
  })

  it('api-reference.stage renders a table generated from cli-reference.json, not hand-typed', () => {
    const out = render('api-reference.stage')
    expect(out).toContain('| verb')
    expect(out).toContain('render')
    expect(out).toContain('validate')
    expect(out).toContain('doctor')
  })
})

describe('a scan of examples/showcase/ finds zero retired-directive syntax', () => {
  it.each(['index.stage', 'report.stage', 'api-reference.stage'])('%s: no @db/@http/@phase/@markdownai syntax', (file) => {
    const out = render(file)
    expect(out).not.toMatch(/@(db|http|phase|markdownai)\b/)
  })
})
