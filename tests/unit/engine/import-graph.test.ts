import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'
import { strip } from '../../../src/engine/stripper.js'

// @import-graph src="./src": walks a source tree and emits a Mermaid
// dependency graph, filesystem-read only (no @code/shell grant needed,
// same data-path jail @list/@tree already use). Ported from
// examples/import-graph/import-graph.js, generalized for an arbitrary
// directory (see import-graph.ts's own header comment for the accuracy
// trade-off: no project-specific tsconfig path-alias resolution).
describe('@import-graph', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-import-graph-'))
    mkdirSync(join(dir, 'src', 'sub'), { recursive: true })
  })

  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(src: string): string {
    const filePath = join(dir, 'q.stage')
    const ast = parse(src, { filePath })
    return execute(ast, {
      filePath,
      ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } },
    }).output
  }

  it('walks a small tree and emits nodes and edges for relative imports', () => {
    writeFileSync(join(dir, 'src', 'a.ts'), `import { b } from './b.js';\nexport { c } from './sub/c.js';\n`)
    writeFileSync(join(dir, 'src', 'b.ts'), `export const b = 1;\n`)
    writeFileSync(join(dir, 'src', 'sub', 'c.ts'), `export const c = 2;\n`)

    const out = render('@import-graph src="src" /')
    expect(out).toContain('```mermaid')
    expect(out).toContain('graph TD')
    expect(out).toContain('a["a"]')
    expect(out).toContain('b["b"]')
    expect(out).toContain('sub_c["sub/c"]')
    expect(out).toContain('a --> b')
    expect(out).toContain('a --> sub_c')
  })

  it('accepts the positional form, same as the named src= form', () => {
    writeFileSync(join(dir, 'src', 'a.ts'), `import { b } from './b.js';\n`)
    writeFileSync(join(dir, 'src', 'b.ts'), `export const b = 1;\n`)
    const named = render('@import-graph src="src" /')
    const positional = render('@import-graph "src" /')
    expect(positional).toBe(named)
  })

  it('resolves TypeScript\'s inline type-only import form', () => {
    // The exact bug found live in examples/import-graph/import-graph.js's
    // first draft: a dependency that existed ONLY via import('./x.js').Type,
    // no top-level import statement, was silently invisible.
    writeFileSync(join(dir, 'src', 'a.ts'), `type T = import('./types.js').X;\nexport { T };\n`)
    writeFileSync(join(dir, 'src', 'types.ts'), `export type X = string;\n`)
    const out = render('@import-graph src="src" /')
    expect(out).toContain('a --> types')
  })

  it('resolves a bare `export * from` / `export type * from` re-export-all with no `as name` binding', () => {
    // The exact bug found live via the import-graph ground-truth benchmark
    // (benchmarks/import-graph-ground-truth.cjs): FROM_CLAUSE's three
    // alternatives (a brace list, `* as name`, or a bare identifier) had no
    // case for a lone `*` with no binding at all, so `export * from './x'`
    // (and `export type * from './x'`, this project's own src/parser/
    // index.ts and src/renderer/index.ts both use the type form) was
    // silently invisible unless some OTHER statement in the same file also
    // happened to import from the same specifier and accidentally supplied
    // the edge.
    writeFileSync(join(dir, 'src', 'a.ts'), `export * from './b.js';\n`)
    writeFileSync(join(dir, 'src', 'sub', 'c.ts'), `export type * from './d.js';\n`)
    writeFileSync(join(dir, 'src', 'b.ts'), `export const b = 1;\n`)
    writeFileSync(join(dir, 'src', 'sub', 'd.ts'), `export type D = string;\n`)
    const out = render('@import-graph src="src" /')
    expect(out).toContain('a --> b')
    expect(out).toContain('sub_c --> sub_d')
  })

  it('resolves a directory import to its index file', () => {
    writeFileSync(join(dir, 'src', 'a.ts'), `import { b } from './sub';\n`)
    writeFileSync(join(dir, 'src', 'sub', 'index.ts'), `export const b = 1;\n`)
    const out = render('@import-graph src="src" /')
    expect(out).toContain('a --> sub_index')
  })

  it('ignores bare (non-relative) package specifiers', () => {
    writeFileSync(join(dir, 'src', 'a.ts'), `import { z } from 'some-package';\nimport { readFile } from 'node:fs';\nexport const a = z;\n`)
    const out = render('@import-graph src="src" /')
    expect(out).toContain('a["a"]')
    expect(out).not.toContain('some-package')
    expect(out).not.toContain('node:fs')
    // Only one node: no edges to anything, since both specifiers are bare.
    expect(out).not.toMatch(/-->/)
  })

  it('skips node_modules, dist, build, and .git even if they sit under src=', () => {
    mkdirSync(join(dir, 'src', 'node_modules', 'x'), { recursive: true })
    writeFileSync(join(dir, 'src', 'node_modules', 'x', 'index.ts'), `export const noise = 1;\n`)
    writeFileSync(join(dir, 'src', 'a.ts'), `export const a = 1;\n`)
    const out = render('@import-graph src="src" /')
    expect(out).toContain('a["a"]')
    expect(out).not.toContain('node_modules')
  })

  it('output is deterministic: node and edge order is sorted, not filesystem order', () => {
    writeFileSync(join(dir, 'src', 'zeta.ts'), `import { a } from './alpha.js';\n`)
    writeFileSync(join(dir, 'src', 'alpha.ts'), `export const a = 1;\n`)
    const first = render('@import-graph src="src" /')
    const second = render('@import-graph src="src" /')
    expect(first).toBe(second)
    // alpha sorts before zeta
    expect(first.indexOf('alpha["alpha"]')).toBeLessThan(first.indexOf('zeta["zeta"]'))
  })

  it('is filesystem-read only: renders with allowShell false and no policy grant', () => {
    writeFileSync(join(dir, 'src', 'a.ts'), `export const a = 1;\n`)
    // beforeEach's default ctx already has allowShell: false; a passing
    // render here is the proof no shell/@code path is involved.
    const out = render('@import-graph src="src" /')
    expect(out).toContain('a["a"]')
  })

  it('a src= path outside the data jail is blocked, not silently walked', () => {
    // Matches @tree/@list: a blocked path returns nothing (plus a
    // SECURITY_ALERT warning), it never falls back to an empty-but-present
    // graph, which would look identical to "the directory is just empty."
    const out = render('@import-graph src="/etc" /')
    expect(out).toBe('')
  })

  it('an empty or missing directory renders an empty graph, not an error', () => {
    const out = render('@import-graph src="does-not-exist" /')
    expect(out).toBe('```mermaid\ngraph TD\n```')
  })

  it('static fallback (strip, no engine): contributes nothing, same as @list/@tree/@graph', () => {
    const filePath = join(dir, 'q.stage')
    const ast = parse('@import-graph src="src" /', { filePath })
    const result = strip(ast)
    expect(result.output.trim()).toBe('')
  })

  it('requires src=, a directive with neither positional nor src= is a parse error', () => {
    expect(() => parse('@import-graph /', { filePath: join(dir, 'q.stage') })).toThrow(/requires src=/)
  })
})

// tsconfig path-alias resolution: the generic answer to "a directive
// pointed at an arbitrary src= can't know another project's tsconfig
// paths", read live from a real tsconfig.json (compilerOptions.baseUrl/
// paths) rather than hardcoded, same as this project's own three
// livestage/* self-import aliases.
describe('@import-graph: tsconfig path-alias resolution', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-import-graph-tsconfig-'))
    mkdirSync(join(dir, 'src', 'sub'), { recursive: true })
  })

  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(src: string): string {
    const filePath = join(dir, 'q.stage')
    const ast = parse(src, { filePath })
    return execute(ast, {
      filePath,
      ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } },
    }).output
  }

  it('auto-discovers tsconfig.json by walking up from src=, resolves an exact-match alias', () => {
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { 'myproj/utils': ['src/sub/utils.ts'] } },
    }))
    writeFileSync(join(dir, 'src', 'a.ts'), `import { u } from 'myproj/utils';\n`)
    writeFileSync(join(dir, 'src', 'sub', 'utils.ts'), `export const u = 1;\n`)
    const out = render('@import-graph src="src" /')
    expect(out).toContain('a --> sub_utils')
  })

  it('resolves a wildcard alias pattern, substituting the captured remainder', () => {
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { 'myproj/*': ['src/sub/*'] } },
    }))
    writeFileSync(join(dir, 'src', 'a.ts'), `import { u } from 'myproj/utils';\n`)
    writeFileSync(join(dir, 'src', 'sub', 'utils.ts'), `export const u = 1;\n`)
    const out = render('@import-graph src="src" /')
    expect(out).toContain('a --> sub_utils')
  })

  it('tsconfig= points explicitly at a config file with any name or location, not just auto-discovered', () => {
    writeFileSync(join(dir, 'custom-paths.json'), JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { 'myproj/utils': ['src/sub/utils.ts'] } },
    }))
    writeFileSync(join(dir, 'src', 'a.ts'), `import { u } from 'myproj/utils';\n`)
    writeFileSync(join(dir, 'src', 'sub', 'utils.ts'), `export const u = 1;\n`)
    const out = render('@import-graph src="src" tsconfig="custom-paths.json" /')
    expect(out).toContain('a --> sub_utils')
  })

  it('a bare specifier that matches no alias and is not relative is left unresolved (external package)', () => {
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { 'myproj/utils': ['src/sub/utils.ts'] } },
    }))
    writeFileSync(join(dir, 'src', 'a.ts'), `import { z } from 'some-npm-package';\nexport const a = z;\n`)
    const out = render('@import-graph src="src" /')
    expect(out).toContain('a["a"]')
    expect(out).not.toMatch(/-->/)
  })

  it('no tsconfig.json anywhere in the walk-up: behaves exactly as before, bare specifiers unresolved', () => {
    writeFileSync(join(dir, 'src', 'a.ts'), `import { z } from 'myproj/utils';\nexport const a = z;\n`)
    const out = render('@import-graph src="src" /')
    expect(out).toContain('a["a"]')
    expect(out).not.toMatch(/-->/)
  })

  it('an unreadable/invalid tsconfig.json degrades quietly, no error, no alias resolution', () => {
    writeFileSync(join(dir, 'tsconfig.json'), 'not valid json {{{')
    writeFileSync(join(dir, 'src', 'a.ts'), `import { z } from 'myproj/utils';\nexport const a = z;\n`)
    expect(() => render('@import-graph src="src" /')).not.toThrow()
    const out = render('@import-graph src="src" /')
    expect(out).not.toMatch(/-->/)
  })

  it('an explicit tsconfig= pointing outside the data jail is blocked, not silently ignored', () => {
    writeFileSync(join(dir, 'src', 'a.ts'), `export const a = 1;\n`)
    const out = render('@import-graph src="src" tsconfig="/etc/tsconfig.json" /')
    // The src= walk itself is unaffected by the blocked tsconfig=; only
    // alias resolution is unavailable.
    expect(out).toContain('a["a"]')
  })
})
