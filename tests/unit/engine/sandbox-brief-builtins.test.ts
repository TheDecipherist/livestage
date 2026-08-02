import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

// Audited during wave 2, feature 19 (Composition Directives): read_section,
// parse_brief, and extract_paths predate the removal of the AI-consumer
// directive syntax (@section, @phase, @prompt) at seed, but are generic text
// utilities with no dependency on that removed syntax (a markdown section
// extractor, a **Label.** block parser, and a backtick-path extractor),
// currently used by MDD's own build flow to seed feature docs from wave
// briefs. Kept per the doc's own audit criterion; this is their only test
// coverage, there was none before.
describe('sandbox builtins: read_section / parse_brief / extract_paths', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-brief-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('read_section extracts the body under a matching heading', () => {
    writeFileSync(join(dir, 'wave.md'), '# Wave\n\n## Feature A\n\nBody A text.\n\n## Feature B\n\nBody B text.\n')
    const src = '{{ read_section("./wave.md", "Feature A") }}'
    const ast = parse(src, { filePath: join(dir, 'doc.stage') })
    const result = execute(ast, { ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
    expect(result.output).toContain('Body A text.')
    expect(result.output).not.toContain('Body B text.')
  })

  it('read_section returns empty string when the file does not exist', () => {
    const src = '<<{{ read_section("./missing.md", "X") }}>>'
    const ast = parse(src, { filePath: join(dir, 'doc.stage') })
    const result = execute(ast, { ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
    expect(result.output).toContain('<<>>')
  })

  it('parse_brief splits a **Label.** block into a struct accessible by snake_case key', () => {
    const src = '{{ parse_brief("**Purpose.** Do the thing.\\n\\n**Definition of Done.** It works.").purpose }}'
    const ast = parse(src, { filePath: join(dir, 'doc.stage') })
    const result = execute(ast, { ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
    expect(result.output.trim()).toBe('Do the thing.')
  })

  it('extract_paths pulls backtick-wrapped file paths out of a text chunk', () => {
    const src = '{{ extract_paths("Touches `src/a.ts` and `src/b.ts`, not `plain text`.").join(",") }}'
    const ast = parse(src, { filePath: join(dir, 'doc.stage') })
    const result = execute(ast, { ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
    expect(result.output.trim()).toBe('src/a.ts,src/b.ts')
  })
})
