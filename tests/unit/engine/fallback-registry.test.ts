import { describe, it, expect } from 'vitest'
import { parse, getAvailableDirectives } from 'livestage/parser'
import { strip } from '../../../src/engine/stripper.js'

// CR-6 (Fallback Totality, feature 14) satisfied here (feature 24): every
// directive in the parser's registry has defined fallback behavior in
// strip()'s stripNode switch. The real implementation is a switch statement,
// not a separate {directive, fallbackText} data table as an early draft of
// this doc's Data Model section assumed, so "has a fallback" is verified as
// "stripNode does not fall through to its throwing default case" for a
// minimal real fixture of each registered directive, rather than by reading
// a table. A directive added to the parser without a corresponding stripNode
// case would fail this test with "unhandled AST node type", not silently
// pass.
const FIXTURES: Record<string, string> = {
  assert: '@assert operator="file-exists" target="package.json" /',
  call: '@call foo /',
  code: '@code language="javascript"\nconsole.log(1)\n@code-end',
  check: '@check command="true" /',
  count: '@count ./ /',
  data: '@data r\n  a = 1\n@data-end',
  date: '@date /',
  define: '@define foo\nbody\n@define-end',
  env: '@env X /',
  foreach: '@foreach x in @list ./ /\nbody\n@foreach-end',
  graph: '@graph plan.md /',
  hash: '@hash path="package.json" /',
  if: '@if true\nbody\n@if-end',
  import: '@import ./x.md /',
  include: '@include ./x.md /',
  list: '@list ./ /',
  pipe: '@list ./ | @render type="list" /',
  query: '@query "echo hi" /',
  read: '@read ./package.json path="name" /',
  'read-frontmatter': '@read-frontmatter ./x.md field="status" /',
  render: '@render type="list" /',
  set: '@set x = "1" /',
  switch: '@switch "a"\n  @case "a"\n    yes\n@switch-end',
  template: '@template ./x.md /',
  test: '@test command="true" /',
  tree: '@tree ./ /',
  'update-frontmatter': '@update-frontmatter path="doc.md" field="x" value="y" /',
}

describe('CR-6: every registered directive has defined strip fallback behavior', () => {
  const registered = getAvailableDirectives().map(d => d.name)

  it('the fixture table covers every directive the parser registry currently declares', () => {
    const missing = registered.filter(name => !(name in FIXTURES))
    expect(missing).toEqual([])
  })

  it.each(registered)('%s: strip() does not throw', (name) => {
    const src = FIXTURES[name]
    expect(src, `no fixture registered for directive "${name}"`).toBeDefined()
    const ast = parse(src!)
    expect(() => strip(ast)).not.toThrow()
  })

  it('proves this test actually catches an unhandled directive: a synthetic node type with no stripNode case throws', () => {
    const fakeAst = {
      isLiveStage: true,
      version: null,
      nodes: [{ type: 'totally-invented-directive-xyz', line: 1 }],
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(() => strip(fakeAst as any)).toThrow(/unhandled AST node type/)
  })
})
