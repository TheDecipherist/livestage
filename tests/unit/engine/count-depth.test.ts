import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'livestage/parser'
import { execute } from '../../../src/engine/engine.js'

// @count's depth= support (feature 52, 2026-08-17): executeCount
// hardcoded walkDir's maxDepth to -1 (unlimited) for directory counts,
// unlike executeList/executeTree which both read node.args['depth'].
// Found live while building CLAUDE.stage: a `@count "src" type="dirs"
// depth="0"` call meant to count only top-level module directories
// silently recursed unlimited depth instead, counting every nested
// directory at every level too.
describe('@count depth= limits directory recursion the same way @list/@tree already do', () => {
  let dir: string
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-count-depth-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function render(content: string) {
    const filePath = join(dir, 'main.stage')
    const ast = parse(content, { filePath })
    return execute(ast, { filePath, ctx: { cwd: dir, security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: dir } } })
  }

  // Fixture lives under tree/, not the render root: rendering writes
  // .livestage/trace/ into the cwd as a side effect, which would
  // otherwise silently inflate a count of "." itself. 3 top-level dirs
  // under tree/, one of which (b) has 2 nested subdirs.
  // Unlimited (no depth=): 5 total. depth="0": 3 (top-level only).
  beforeEach(() => {
    mkdirSync(join(dir, 'tree', 'a'), { recursive: true })
    mkdirSync(join(dir, 'tree', 'b', 'nested1'), { recursive: true })
    mkdirSync(join(dir, 'tree', 'b', 'nested2'), { recursive: true })
    mkdirSync(join(dir, 'tree', 'c'), { recursive: true })
  })

  it('depth="0" counts only top-level directories, not nested ones', () => {
    const result = render('@count "tree" type="dirs" depth="0" /')
    expect(result.output.trim()).toBe('3')
  })

  it('omitting depth= still recurses unlimited, unchanged behavior', () => {
    const result = render('@count "tree" type="dirs" /')
    expect(result.output.trim()).toBe('5')
  })

  it('depth= also limits a file count the same way, matching match= behavior', () => {
    writeFileSync(join(dir, 'tree', 'top.txt'), '')
    writeFileSync(join(dir, 'tree', 'a', 'nested.txt'), '')
    const result = render('@count "tree" match="*.txt" depth="0" /')
    expect(result.output.trim()).toBe('1')
  })
})
