import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

// F-FM-QUERY (feature 36): @list where=/fields= over a glob queries each
// matched file's frontmatter instead of listing directory entries. Built
// against a small fixture corpus (a handful of docs, not the full 25 used
// for live verification) since unit tests only need to prove the mechanism.
describe('@list frontmatter query (F-FM-QUERY)', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-fmq-'))
    mkdirSync(join(dir, 'docs'))
    const docs: [string, string][] = [
      ['a.stage', '---\npath: wave-1/a\nid: a\nstatus: complete\nwave: wave-1\nknown_issues: []\n---\nA'],
      ['b.stage', '---\npath: wave-1/b\nid: b\nstatus: in_progress\nwave: wave-1\nknown_issues: [bug-1]\n---\nB'],
      ['c.stage', '---\npath: wave-2/c\nid: c\nstatus: in_progress\nwave: wave-2\nknown_issues: [bug-2, bug-3]\n---\nC'],
      ['d.stage', '---\npath: wave-2/d\nid: d\nstatus: planned\nwave: wave-2\nknown_issues: []\n---\nD'],
    ]
    for (const [name, content] of docs) writeFileSync(join(dir, 'docs', name), content)
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function run(src: string) {
    const filePath = join(dir, 'q.stage')
    const ast = parse(src, { filePath })
    return execute(ast, {
      filePath,
      ctx: { cwd: dir, security: { allowShell: true, allowHttp: false, allowDb: false, jailRoot: dir } },
    })
  }

  it('where= filters and fields= projects a header row + tab rows for @render table', () => {
    const result = run('@list docs/*.stage where="status != \'complete\'" fields="id,status,wave" | @render table /')
    expect(result.output).toMatch(/\|\s*id\s*\|\s*status\s*\|\s*wave\s*\|/)
    expect(result.output).toMatch(/\|\s*b\s*\|\s*in_progress\s*\|\s*wave-1\s*\|/)
    expect(result.output).not.toMatch(/\|\s*a\s*\|/)
  })

  it('array-length predicate filters correctly (known_issues.length > 0)', () => {
    const result = run('@list docs/*.stage where="known_issues.length > 0" fields="id" | @render table /')
    expect(result.output).toMatch(/\|\s*b\s*\|/)
    expect(result.output).toMatch(/\|\s*c\s*\|/)
    expect(result.output).not.toMatch(/\|\s*a\s*\|/)
    expect(result.output).not.toMatch(/\|\s*d\s*\|/)
  })

  it('the != []/== [] sugar is rewritten to a correct emptiness check, not a vacuous reference compare', () => {
    const nonEmpty = run('@list docs/*.stage where="known_issues != []" fields="id" | @render table /')
    expect(nonEmpty.output).toMatch(/\|\s*b\s*\|/)
    expect(nonEmpty.output).not.toMatch(/\|\s*a\s*\|/)

    const empty = run('@list docs/*.stage where="known_issues == []" fields="id" | @render table /')
    expect(empty.output).toMatch(/\|\s*a\s*\|/)
    expect(empty.output).not.toMatch(/\|\s*b\s*\|/)
  })

  it('fields= alone (no where=) projects every matched file', () => {
    const result = run('@list docs/*.stage fields="id" | @render table /')
    for (const id of ['a', 'b', 'c', 'd']) expect(result.output).toMatch(new RegExp(`\\|\\s*${id}\\s*\\|`))
  })

  it('a nested-array where= is refused with a warning pointing at @code, not a silent wrong answer', () => {
    const result = run('@list docs/*.stage where="satisfies_contracts[0].status == \'done\'" fields="id" /')
    expect(result.warnings.some(w => w.includes('nested-array') && w.includes('@code'))).toBe(true)
  })
})

describe('count-by pipe builtin', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-fmq-cb-'))
    mkdirSync(join(dir, 'docs'))
    const statuses = ['complete', 'complete', 'in_progress', 'planned']
    statuses.forEach((s, i) => {
      writeFileSync(join(dir, 'docs', `${i}.stage`), `---\nid: f${i}\nstatus: ${s}\n---\nbody`)
    })
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function run(src: string) {
    const filePath = join(dir, 'q.stage')
    const ast = parse(src, { filePath })
    return execute(ast, {
      filePath,
      ctx: { cwd: dir, security: { allowShell: true, allowHttp: false, allowDb: false, jailRoot: dir } },
    })
  }

  it('aggregates projected rows by field value, most common first', () => {
    const result = run('@list docs/*.stage fields="id,status" | count-by status | @render table columns="status,count" /')
    const lines = result.output.split('\n')
    const completeLine = lines.find(l => l.includes('complete') && !l.includes('in_progress'))
    expect(completeLine).toContain('2')
    expect(result.output).toContain('in_progress')
    expect(result.output).toContain('planned')
  })
})

describe('@render tree groups projected rows by breadcrumb (F-FM-QUERY business rule 7)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-fmq-tree-'))
    mkdirSync(join(dir, 'docs'))
    writeFileSync(join(dir, 'docs', 'a.stage'), '---\npath: wave-1/a\nid: a\nstatus: complete\n---\nA')
    writeFileSync(join(dir, 'docs', 'b.stage'), '---\npath: wave-1/b\nid: b\nstatus: planned\n---\nB')
    writeFileSync(join(dir, 'docs', 'c.stage'), '---\npath: wave-2/c\nid: c\nstatus: complete\n---\nC')
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('column one groups leaves under shared prefixes, with remaining columns as annotation', () => {
    const filePath = join(dir, 'q.stage')
    const ast = parse('@list docs/*.stage fields="path,status" | @render tree /', { filePath })
    const result = execute(ast, {
      filePath,
      ctx: { cwd: dir, security: { allowShell: true, allowHttp: false, allowDb: false, jailRoot: dir } },
    })
    const lines = result.output.split('\n')
    expect(lines).toContain('- wave-1')
    expect(lines).toContain('- wave-2')
    expect(lines.some(l => l.includes('a (status: complete)'))).toBe(true)
    expect(lines.some(l => l.includes('b (status: planned)'))).toBe(true)
    expect(lines.some(l => l.includes('c (status: complete)'))).toBe(true)
  })

  it('the bare positional form (@render tree, no type=) works the same as type="tree"', () => {
    const filePath = join(dir, 'q.stage')
    const ast = parse('@list docs/*.stage fields="path,status" | @render tree /', { filePath })
    const explicit = parse('@list docs/*.stage fields="path,status" | @render type="tree" /', { filePath })
    const ctx = { cwd: dir, security: { allowShell: true, allowHttp: false, allowDb: false, jailRoot: dir } }
    const a = execute(ast, { filePath, ctx })
    const b = execute(explicit, { filePath, ctx })
    expect(a.output).toBe(b.output)
  })
})

describe('@read-frontmatter struct mode (F-FM-QUERY business rule 3)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-fmq-struct-'))
    writeFileSync(join(dir, 'doc.stage'), '---\nid: x\nstatus: complete\nwave: wave-3\n---\nBody')
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function run(src: string) {
    const filePath = join(dir, 'q.stage')
    const ast = parse(src, { filePath })
    return execute(ast, { filePath, ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
  }

  it('label= without field= captures every top-level field, reachable by dot-access', () => {
    const result = run('@read-frontmatter path="doc.stage" label="doc" /\n{{ doc.status }} / {{ doc.wave }}')
    expect(result.output.trim()).toBe('complete / wave-3')
  })

  it('single-field mode (field= given) is unchanged: only the requested field is returned', () => {
    const result = run('@read-frontmatter path="doc.stage" field="status" /')
    expect(result.output.trim()).toBe('complete')
  })

  it('neither field= nor label= is a clear error, not a silent empty read', () => {
    const result = run('@read-frontmatter path="doc.stage" /')
    expect(result.warnings.some(w => w.includes('field=') && w.includes('label='))).toBe(true)
  })

  it('struct capture works inside a @foreach body, re-resolving per iteration', () => {
    mkdirSync(join(dir, 'docs'))
    writeFileSync(join(dir, 'docs', 'x.stage'), '---\nid: x\nstatus: complete\n---\nX')
    writeFileSync(join(dir, 'docs', 'y.stage'), '---\nid: y\nstatus: planned\n---\nY')
    const result = run('@foreach f in @list docs/ match="*.stage"\n@read-frontmatter path="{{ f }}" label="doc" /\n- {{ doc.id }}: {{ doc.status }}\n@foreach-end')
    expect(result.output).toContain('x: complete')
    expect(result.output).toContain('y: planned')
  })
})
