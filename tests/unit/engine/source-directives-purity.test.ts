import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execute } from '../../../src/engine/engine.js'
import { parse } from 'livestage/parser'

// CR-10 (Render Purity) and the checkWritePath contract feature 17
// (Source Directives) inherits from feature 10: source directives are pure
// reads and must never touch the document corpus, so filesystem.write_enabled
// is never true for this component and checkWritePath's "when" condition
// never fires. .livestage/ (the render trace) is excluded from the snapshot:
// spec line 45 names it "the only cross-invocation artifact" the engine
// writes, sanctioned infrastructure distinct from corpus content, not a
// purity violation.
function snapshot(dir: string): string[] {
  return readdirSync(dir).filter(name => name !== '.livestage').sort().map(name => {
    const full = join(dir, name)
    const st = statSync(full)
    return `${name}:${st.isDirectory() ? 'dir' : st.size}`
  })
}

describe('source directives never mutate the filesystem (CR-10 / checkWritePath never applies)', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-source-purity-'))
    writeFileSync(join(dir, 'data.json'), '{"name":"demo"}')
    writeFileSync(join(dir, 'rows.csv'), 'name,val\na,1\n')
    writeFileSync(join(dir, 'doc.md'), '---\nstatus: active\n---\nbody')
  })

  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('rendering every source directive leaves the directory snapshot unchanged', () => {
    const before = snapshot(dir)
    const src = [
      '@list ./ match="*.json" /',
      '@read ./data.json path="name" /',
      '@read-frontmatter ./doc.md field="status" /',
      '@tree ./ /',
      '@count ./ match="*.csv" /',
      '@date format="YYYY" /',
      '@env HOME fallback="none" /',
    ].join('\n')
    const ast = parse(src, { filePath: join(dir, 'render-me.stage') })
    const result = execute(ast, { ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
    expect(result.errors).toHaveLength(0)
    const after = snapshot(dir)
    expect(after).toEqual(before)
  })
})
