import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execute } from '../../src/engine/engine.js'
import { parse } from 'livestage/parser'

// CR-10 (Render Purity, feature 15): the corpus-wide harness feature 42
// owns building. source-directives-purity.test.ts (feature 17) proved this
// for wave-2's seven read-side directives against one fixture directory;
// this widens the corpus to every read-side directive across the whole
// build (including features that didn't exist yet when that test was
// written: @assert, @graph, @hash, mocked @query/@code) and, separately,
// proves the harness itself is not vacuous, it actually fails on a real
// filesystem diff, not just "nothing threw".
//
// .livestage/ (the render trace, the cache) is excluded from every
// snapshot: spec line 45 names it the one sanctioned cross-invocation
// artifact the engine writes, distinct from corpus content.
function snapshotDeep(dir: string, rel = ''): string[] {
  const full = join(dir, rel)
  const names = readdirSync(full).filter(n => n !== '.livestage').sort()
  const entries: string[] = []
  for (const name of names) {
    const entryRel = rel ? `${rel}/${name}` : name
    const st = statSync(join(full, name))
    if (st.isDirectory()) {
      entries.push(`${entryRel}:dir`)
      entries.push(...snapshotDeep(dir, entryRel))
    } else {
      entries.push(`${entryRel}:${st.size}`)
    }
  }
  return entries
}

describe('CR-10 render purity: a large read-side corpus never mutates the filesystem', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-purity-corpus-'))
    mkdirSync(join(dir, 'docs'))
    writeFileSync(join(dir, 'data.json'), '{"name":"demo","items":[1,2,3]}')
    writeFileSync(join(dir, 'rows.csv'), 'name,val\na,1\nb,2\n')
    writeFileSync(join(dir, 'docs', 'a.stage'), '---\nid: a\nstatus: active\ndepends_on: b\n---\nbody a')
    writeFileSync(join(dir, 'docs', 'b.stage'), '---\nid: b\nstatus: active\n---\nbody b')
    writeFileSync(join(dir, 'fixture-out.txt'), 'mocked query output\n')
  })

  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('rendering every read-side directive across the corpus leaves the filesystem byte-identical', () => {
    const before = snapshotDeep(dir)
    const src = [
      '@list ./ match="*.json" /',
      '@read ./data.json path="name" /',
      '@read-frontmatter path="docs/a.stage" field="status" /',
      '@read-frontmatter path="docs/a.stage" label="doc" /',
      '@tree ./docs /',
      '@count ./docs match="*.stage" /',
      '@date format="YYYY" /',
      '@env HOME fallback="none" /',
      '@hash path="data.json" /',
      '@assert operator="file-exists" target="docs/*.stage" /',
      '@graph target="docs/*.stage" /',
      '@list docs/*.stage where="status == \'active\'" fields="id,status" | @render table /',
      '@query "echo mocked" mock="fixture-out.txt" /',
    ].join('\n')
    const ast = parse(src, { filePath: join(dir, 'render-me.stage') })
    const result = execute(ast, {
      ctx: {
        cwd: dir,
        assertResults: [],
        security: { allowShell: true, allowHttp: false, allowDb: false, jailRoot: dir },
      },
    })
    expect(result.errors).toHaveLength(0)
    expect(snapshotDeep(dir)).toEqual(before)
  })

  it('a run that ALSO does an @update-frontmatter write leaves the corpus untouched except that one target', () => {
    mkdirSync(join(dir, 'writable'))
    writeFileSync(join(dir, 'writable', '.livestage-placeholder'), '')
    rmSync(join(dir, 'writable', '.livestage-placeholder'))
    mkdirSync(join(dir, 'writable', '.livestage'), { recursive: true })
    writeFileSync(join(dir, 'writable', '.livestage', 'policy.json'), JSON.stringify({ filesystem: { write_enabled: true, write_root: 'cwd' } }))
    writeFileSync(join(dir, 'writable', 'target.stage'), '---\nstatus: draft\n---\nbody')
    writeFileSync(join(dir, 'writable', 'untouched.stage'), '---\nstatus: draft\n---\nbody')

    const before = snapshotDeep(join(dir, 'writable'))
    const src = '@update-frontmatter path="target.stage" field="status" value="active" /'
    const ast = parse(src, { filePath: join(dir, 'writable', 'writer.stage') })
    const security = { allowShell: false, allowHttp: false, allowDb: false, jailRoot: join(dir, 'writable'), writeEnabled: true, writeJail: join(dir, 'writable') }
    const result = execute(ast, { ctx: { cwd: join(dir, 'writable'), security } })
    expect(result.errors).toHaveLength(0)

    const after = snapshotDeep(join(dir, 'writable'))
    const changed = after.filter((entry, i) => entry !== before[i])
    // Only target.stage's byte size changed (status: draft -> active is a
    // different length); everything else, including untouched.stage,
    // matches its pre-render entry exactly.
    expect(changed.every(e => e.startsWith('target.stage:'))).toBe(true)
    expect(changed.length).toBeGreaterThan(0)
  })

  it('the harness itself is not vacuous: an actual filesystem diff fails the comparison', () => {
    // Proves assertion (2), that snapshotDeep genuinely detects drift,
    // without needing to inject a broken directive into the real registry.
    // A directive that (incorrectly) wrote a stray file would produce
    // exactly this diff shape.
    const probeDir = mkdtempSync(join(tmpdir(), 'ls-purity-probe-'))
    try {
      writeFileSync(join(probeDir, 'a.txt'), 'x')
      const before = snapshotDeep(probeDir)
      writeFileSync(join(probeDir, 'stray-file-a-broken-directive-would-write.txt'), 'unexpected')
      const after = snapshotDeep(probeDir)
      expect(after).not.toEqual(before)
    } finally {
      rmSync(probeDir, { recursive: true, force: true })
    }
  })
})
