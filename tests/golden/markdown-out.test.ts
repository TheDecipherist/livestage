import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse, getAvailableDirectives } from 'livestage/parser'
import { execute } from '../../src/engine/engine.js'
import type { EngineContext } from '../../src/engine/context.js'
import { FIXTURES, writeFixtureFiles, buildSecurity } from './fixtures.js'

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
  writeFixtureFiles(dir)
})

afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

function makeCtx(): Partial<EngineContext> {
  return { cwd: dir, docDir: dir, security: buildSecurity(dir) }
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
