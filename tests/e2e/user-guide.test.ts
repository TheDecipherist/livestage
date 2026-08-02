import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CLAUDE_MD_SECTION } from '../../src/cli/templates/claude-section.js'

// User Guide (feature 45): a fresh authoring reference for this build's
// real architecture (donor manual not accessible under this project's own
// "never reference the donor codebase outside MDs/livestage-spec.md"
// constraint, see the doc's known_issues), covering the retired directive
// classes by name with a pointer to their replacement pattern, and linked
// from init's CLAUDE.md marker section.
const repoRoot = join(import.meta.dirname, '..', '..')
const guide = readFileSync(join(repoRoot, 'docs', 'user-guide.md'), 'utf8')

describe('docs/user-guide.md', () => {
  it('describes this build\'s real architecture, no server/daemon/session language', () => {
    expect(guide).toMatch(/not a server/i)
    expect(guide).toMatch(/no daemon/i)
    expect(guide.toLowerCase()).not.toMatch(/\bsession\b.*(state|persist)/)
  })

  it('covers every retired directive class by name with a pointer to its replacement pattern', () => {
    expect(guide).toContain('@db')
    expect(guide).toContain('@http')
    expect(guide).toContain('examples/database/')
    expect(guide).toContain('examples/http-health/')
    expect(guide).toContain('examples/multi-step/')
  })

  it('carries zero donor identity strings', () => {
    expect(guide.toLowerCase()).not.toContain('markdownai')
  })

  it('is linked from init\'s CLAUDE.md marker section', () => {
    expect(CLAUDE_MD_SECTION).toContain('docs/user-guide.md')
  })
})
