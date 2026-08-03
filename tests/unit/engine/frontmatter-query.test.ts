import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'
import { parseFrontmatterRow } from '../../../src/engine/frontmatter-utils.js'
import { runRender } from '../../../src/cli/commands/render.js'

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

// F-FM-QUERY parsing/interpolation fixes: parseFrontmatterRow mishandled
// several real YAML shapes found live against this project's own 48-doc
// corpus (multi-line inline-bracket arrays, block-list continuation
// lines), and where= had no way to reference --args/--var. Regression
// cases below are the exact real docs the bugs were found in, not
// synthetic minimal repros, so a fix that handles the synthetic case but
// not the real shape still fails here. An earlier version of this fix
// interpolated {{ }} into where= as TEXT before eval, a real, PoC-proven
// JS-injection sink into whereMatches' runInNewContext (two independent
// review passes reproduced arbitrary code execution via a crafted --args
// value). The corrected design binds arg0/args/vars as real VM context
// variables alongside the frontmatter row, never text-spliced into the
// evaluated expression string: `where="id == arg0"`, not `where="id ==
// '{{ arg0 }}'"`.
describe('F-FM-QUERY parsing/interpolation fixes (amends feature 36)', () => {
  it('a multi-line inline-bracket array parses as the full array, not a truncated scalar (regression: 13-cli-router.md shape)', () => {
    const content = '---\nid: x\nsource_files: [src/cli/cli.ts, src/cli/index.ts, src/cli/commands/parse.ts,\n  src/cli/commands/render.ts, src/engine/engine.ts]\n---\nbody'
    const row = parseFrontmatterRow(content)
    expect(Array.isArray(row?.['source_files'])).toBe(true)
    expect(row?.['source_files']).toEqual([
      'src/cli/cli.ts', 'src/cli/index.ts', 'src/cli/commands/parse.ts',
      'src/cli/commands/render.ts', 'src/engine/engine.ts',
    ])
  })

  it('a closed inline array followed by trailing text on the same line does not extend accumulation into later fields (regression: found by review, distinct from the unclosed-array case)', () => {
    const content = '---\nid: x\ntags: [a, b] # trailing note, not a supported comment but must not corrupt later fields\ntitle: Delta\nstatus: draft\n---\nbody'
    const row = parseFrontmatterRow(content)
    expect(row?.['tags']).toEqual(['a', 'b'])
    expect(row?.['id']).toBe('x')
    expect(row?.['title']).toBe('Delta')
    expect(row?.['status']).toBe('draft')
  })

  it('an inline array that never closes falls back to a contained scalar on just that field, never swallowing later fields', () => {
    const content = '---\nid: x\nbroken: [a, b\ntitle: Delta\nstatus: draft\n---\nbody'
    const row = parseFrontmatterRow(content)
    expect(row?.['title']).toBe('Delta')
    expect(row?.['status']).toBe('draft')
    expect(typeof row?.['broken']).toBe('string')
  })

  it('a block-list entry whose quoted text wraps across lines parses as the complete, untruncated string (regression: 22-pipe.md shape)', () => {
    const content = '---\nid: x\nknown_issues:\n  - "RESOLVED (2026-08-02, post-initiative known_issues sweep): the\n    quoted-flag-lookalike limitation above is fixed. tokenize() now\n    returns clean results."\n---\nbody'
    const row = parseFrontmatterRow(content)
    const issues = row?.['known_issues'] as string[]
    expect(issues[0]).toBe('RESOLVED (2026-08-02, post-initiative known_issues sweep): the quoted-flag-lookalike limitation above is fixed. tokenize() now returns clean results.')
  })

  it('a block-list-of-objects entry parses as a real object with every key, not just the first line (regression: primitives shape)', () => {
    const content = '---\nid: x\nprimitives:\n  - name: "@list"\n    kind: directive\n  - name: "@read"\n    kind: directive\n---\nbody'
    const row = parseFrontmatterRow(content)
    const prims = row?.['primitives'] as Array<{ name: string; kind: string }>
    expect(prims).toEqual([{ name: '@list', kind: 'directive' }, { name: '@read', kind: 'directive' }])
  })

  it('a non-key:value continuation line under an object item is appended to the last key set, never silently dropped (regression: found by review)', () => {
    const content = '---\nid: x\nknown_issues:\n  - Note: the parser drops trailing commas\n    and it also mangles wrapped continuation lines\n---\nbody'
    const row = parseFrontmatterRow(content)
    const issues = row?.['known_issues'] as Array<{ Note: string }>
    expect(issues).toEqual([{ Note: 'the parser drops trailing commas and it also mangles wrapped continuation lines' }])
  })

  it('where= references arg0 as a bound variable; a hardcoded literal continues to match identically', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-fmq-args-'))
    try {
      mkdirSync(join(dir, 'docs'))
      writeFileSync(join(dir, 'docs', 'a.stage'), '---\nid: 17-source-directives\nstatus: complete\n---\nA')
      writeFileSync(join(dir, 'docs', 'b.stage'), '---\nid: 18-compute-directives\nstatus: complete\n---\nB')

      const literalQuery = join(dir, 'literal.stage')
      writeFileSync(literalQuery, '@list docs/*.stage where="id == \'17-source-directives\'" fields="id" | @render type="table" /')
      const literal = runRender(literalQuery, { cwd: dir })
      expect(literal.output).toMatch(/\|\s*17-source-directives\s*\|/)
      expect(literal.output).not.toMatch(/\|\s*18-compute-directives\s*\|/)

      const argQuery = join(dir, 'arg.stage')
      writeFileSync(argQuery, '@list docs/*.stage where="id == arg0" fields="id" | @render type="table" /')
      const withArg = runRender(argQuery, { cwd: dir, args: '17-source-directives' })
      expect(withArg.output).toMatch(/\|\s*17-source-directives\s*\|/)
      expect(withArg.output).not.toMatch(/\|\s*18-compute-directives\s*\|/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('where= referencing an unset arg matches nothing, never silently disables the filter and returns everything (F-ARGS: passive hook renders carry no arguments)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-fmq-noargs-'))
    try {
      mkdirSync(join(dir, 'docs'))
      writeFileSync(join(dir, 'docs', 'a.stage'), '---\nid: 17-source-directives\nstatus: complete\n---\nA')
      writeFileSync(join(dir, 'docs', 'b.stage'), '---\nid: 18-compute-directives\nstatus: complete\n---\nB')
      const query = join(dir, 'q.stage')
      writeFileSync(query, '@list docs/*.stage where="id == arg0" fields="id" | @render type="table" /')
      const result = runRender(query, { cwd: dir })
      expect(result.output).not.toMatch(/\|\s*17-source-directives\s*\|/)
      expect(result.output).not.toMatch(/\|\s*18-compute-directives\s*\|/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('a crafted --args value cannot break out of the where= comparison to run arbitrary code (security regression: PoC from review, now inert)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-fmq-inject-'))
    try {
      mkdirSync(join(dir, 'docs'))
      writeFileSync(join(dir, 'docs', 'a.stage'), '---\nid: real-doc\nstatus: complete\n---\nA')
      const query = join(dir, 'q.stage')
      writeFileSync(query, '@list docs/*.stage where="id == arg0" fields="id" | @render type="table" /')
      // The exact PoC shape from the security review: an injection payload
      // that, if it were spliced into the expression as text, would short-
      // circuit the comparison to true for every row. Bound as a plain
      // string variable instead, it's just a value that equals no real id.
      const payload = "nomatch' || '1'=='1"
      const result = runRender(query, { cwd: dir, args: payload })
      expect(result.output).not.toMatch(/\|\s*real-doc\s*\|/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('the new multi-line array and object-list shapes work through the full @list where=/fields= pipeline, not just direct parseFrontmatterRow calls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ls-fmq-pipeline-'))
    try {
      mkdirSync(join(dir, 'docs'))
      writeFileSync(join(dir, 'docs', 'a.stage'), '---\nid: a\nsource_files: [src/one.ts, src/two.ts,\n  src/three.ts]\nprimitives:\n  - name: "@foo"\n    kind: directive\n---\nA')
      const query = join(dir, 'q.stage')
      writeFileSync(query, '@list docs/*.stage where="source_files.length == 3" fields="id,source_files" | @render type="table" /')
      const result = runRender(query, { cwd: dir })
      expect(result.output).toMatch(/\|\s*a\s*\|/)
      expect(result.output).toContain('src/three.ts')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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
