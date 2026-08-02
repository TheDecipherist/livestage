import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

// @graph schema check (feature 32, F-SCHEMA): a graphed doc's OTHER scalar
// fields (not the relation field itself, the schema vocabulary has no
// array type) get checked against its declared class, the same warn-not-
// block pattern @read-frontmatter uses. Previously nothing validated a
// graphed doc against its own schema at all.
describe('@graph schema check', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-graph-schema-'))
    mkdirSync(join(dir, '.livestage', 'schemas'), { recursive: true })
    writeFileSync(join(dir, '.livestage', 'schemas', 'feature-doc.json'),
      JSON.stringify({ class: 'feature-doc', fields: { status: { type: 'string', enum: ['complete', 'planned'] } } }))
  })

  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(src: string) {
    const filePath = join(dir, 'q.stage')
    const ast = parse(src, { filePath })
    return execute(ast, {
      filePath,
      ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } },
    })
  }

  it('warns when a graphed doc violates its declared schema, still includes it as a node', () => {
    writeFileSync(join(dir, 'a.md'), '---\nclass: feature-doc\nid: a\nstatus: bogus\ndepends_on: []\n---\nA')
    const result = render('@graph target="*.md" /')
    expect(result.warnings.join('\n')).toMatch(/does not conform to its declared schema/)
    expect(result.output).toContain('- a')
  })

  it('no warning when every graphed doc conforms', () => {
    writeFileSync(join(dir, 'a.md'), '---\nclass: feature-doc\nid: a\nstatus: complete\ndepends_on: []\n---\nA')
    const result = render('@graph target="*.md" /')
    expect(result.warnings).toHaveLength(0)
  })

  it('docs with no class= are unvalidated, no warning', () => {
    writeFileSync(join(dir, 'a.md'), '---\nid: a\nstatus: bogus\ndepends_on: []\n---\nA')
    const result = render('@graph target="*.md" /')
    expect(result.warnings).toHaveLength(0)
  })
})
