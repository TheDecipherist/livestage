import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, getAvailableDirectives } from 'livestage/parser'
import { execute } from '../../src/engine/engine.js'
import type { EngineContext } from '../../src/engine/context.js'

// CR-11 (Markdown Out, feature 16): a REAL render (not strip, feature 24's
// job) of every registered directive must leave zero `@`-prefixed directive
// syntax in the output, the registry-iterating version this doc's own
// acceptance criteria mark as feature 42's job. Fixtures resolve against
// real files (not missing targets) so this proves the successful-render
// path is clean, not just the degraded/fallback path fallback-registry.test.ts
// (feature 24) already covers.
const DIRECTIVE_RE = /(^|[^`\w])@[a-z][a-z-]*(\s|"|\/|$)/m

let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'ls-markdown-out-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo' }))
  writeFileSync(join(dir, 'x.md'), '---\nstatus: draft\n---\nShared body.')
  writeFileSync(join(dir, 'doc.md'), '---\nstatus: draft\n---\nBody.')
  writeFileSync(join(dir, 'a.md'), '---\nid: a\n---\nA')
  writeFileSync(join(dir, 'defs.md'), '@define foo\ndefined body\n@define-end\n')
  mkdirSync(join(dir, '.livestage'))
  writeFileSync(join(dir, '.livestage', 'policy.json'), JSON.stringify({
    filesystem: { write_enabled: true, write_root: 'cwd' },
    code: { languages: ['javascript'], timeout: 30_000, runners: {} },
  }))
})

afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

const FIXTURES: Record<string, string> = {
  assert: '@assert operator="file-exists" target="package.json" /',
  call: '@import ./defs.md /\n@call foo /',
  code: '@code language="javascript"\nconsole.log(1)\n@code-end',
  check: '@check command="true" /',
  count: '@count ./ match="*.md" /',
  data: '@data r\n  a = 1\n@data-end',
  date: '@date /',
  define: '@define foo\nbody\n@define-end',
  env: '@env HOME fallback="none" /',
  foreach: '@foreach x in @list ./ match="*.md"\nbody\n@foreach-end',
  graph: '@graph target="a.md" /',
  hash: '@hash path="package.json" /',
  if: '@if true\nbody\n@if-end',
  import: '@import ./x.md /',
  include: '@include ./x.md /',
  list: '@list ./ match="*.md" /',
  pipe: '@list ./ match="*.md" | @render type="list" /',
  query: '@query "echo hi" /',
  read: '@read ./package.json path="name" /',
  'read-frontmatter': '@read-frontmatter path="doc.md" field="status" /',
  render: '@render type="list" /',
  set: '@set x = "1" /',
  switch: '@switch "a"\n  @case "a"\n    yes\n@switch-end',
  template: '@template ./x.md /',
  test: '@test command="true" /',
  tree: '@tree ./ /',
  'update-frontmatter': '@update-frontmatter path="doc.md" field="status" value="active" /',
}

function makeCtx(): Partial<EngineContext> {
  return {
    cwd: dir,
    docDir: dir,
    security: {
      allowShell: true, allowHttp: false, allowDb: false, jailRoot: dir,
      shellConfig: { enabled: true, allow_patterns: ['echo *'], deny_patterns: [], allow_network: false, require_confirmation: false, audit_log: false },
      codeConfig: { languages: ['javascript'], timeout: 30_000, runners: {} },
    },
  }
}

describe('CR-11: a real render of every registered directive leaves zero directive syntax', () => {
  const registered = getAvailableDirectives().map(d => d.name)

  it('the fixture table covers every directive the parser registry currently declares', () => {
    const missing = registered.filter(name => !(name in FIXTURES))
    expect(missing).toEqual([])
  })

  it.each(registered)('%s: rendered output contains no @-prefixed directive syntax', (name) => {
    const src = FIXTURES[name]
    expect(src, `no fixture registered for directive "${name}"`).toBeDefined()
    const filePath = join(dir, `${name}-fixture.stage`)
    const ast = parse(src!, { filePath })
    const result = execute(ast, { filePath, ctx: makeCtx() })
    expect(result.output).not.toMatch(DIRECTIVE_RE)
  })

  it('@graph format=mermaid output is a valid fenced markdown code block, not raw mermaid outside a fence', () => {
    const filePath = join(dir, 'graph-mermaid-fixture.stage')
    const ast = parse('@graph target="a.md" format="mermaid" /', { filePath })
    const result = execute(ast, { filePath, ctx: makeCtx() })
    const trimmed = result.output.trim()
    expect(trimmed.startsWith('```mermaid')).toBe(true)
    expect(trimmed.endsWith('```')).toBe(true)
    // Exactly one fence pair: mermaid content never leaks outside it.
    expect(trimmed.match(/```/g)?.length).toBe(2)
  })

  it('proves the check is not vacuous: literal @-directive-shaped text in a code block IS still flagged by the regex itself', () => {
    expect('rendered: @fake-directive "x" /').toMatch(DIRECTIVE_RE)
  })
})
