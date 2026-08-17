import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setupTrustedHome } from '../helpers/trust.js'
import { trustDirectory } from '../../src/engine/security/trust.js'

// Connections Example (feature 46): the doc that proves "generated file" is
// a category LiveStage deletes. Composes a header (@date/@count), a path
// tree (F-FM-QUERY + @render tree), a dependency graph (@graph
// format=mermaid), and source-file overlap (@code, the canonical
// nested-array pattern). The checked-in examples/connections/corpus/
// fixture already plants one broken depends_on (05-hook -> 99-nonexistent)
// and one source_files overlap (src/shared/util.ts, owned by both
// 01-parser and 03-renderer); this proves both sections react correctly,
// and that removing the plants flips them back.
const repoRoot = join(import.meta.dirname, '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')
const exampleSrc = join(repoRoot, 'examples', 'connections')

let trusted: ReturnType<typeof setupTrustedHome>
beforeAll(() => { trusted = setupTrustedHome(exampleSrc) })
afterAll(() => trusted.cleanup())

function render(cwd: string): string {
  return execFileSync('node', [cliEntry, 'render', 'connections.stage', '--home-dir', trusted.homeDir], { cwd, encoding: 'utf8' })
}

describe('connections example against the checked-in fixture corpus (planted broken edge + overlap)', () => {
  it('renders the header, path tree, graph, and overlap sections correctly', () => {
    const out = render(exampleSrc)
    expect(out).toMatch(/Corpus: 5 documents/)
    expect(out).toContain('- Core')
    expect(out).toContain('Parser (status: complete)')
    expect(out).toContain('```mermaid')
    expect(out).toContain('02-engine --> 01-parser')
  })

  it('the planted broken depends_on is reported, not silently dropped', () => {
    const out = render(exampleSrc)
    expect(out).toContain('1 broken.')
    expect(out).toContain('05-hook -> 99-nonexistent-doc')
  })

  it('the planted source_files overlap is reported', () => {
    const out = render(exampleSrc)
    expect(out).toMatch(/src\/shared\/util\.ts/)
    expect(out).toContain('01-parser, 03-renderer')
  })
})

describe('removing the plants flips both sections back (proves the sections are live, not fixed text)', () => {
  it('a corpus with no broken edges and no overlap reports zero of each', () => {
    const workDir = mkdtempSync(join(tmpdir(), 'ls-connections-'))
    try {
      cpSync(exampleSrc, workDir, { recursive: true })
      trustDirectory(workDir, trusted.homeDir) // a fresh copy is a new, distinct directory to trust
      // Fix the planted broken edge.
      writeFileSync(join(workDir, 'corpus', '05-hook.md'),
        '---\nid: 05-hook\npath: Build / Hook\nstatus: planned\ndepends_on: [04-cli]\nsource_files: [src/hook/pretooluse.ts]\n---\n\n# Hook\n')
      // Fix the planted overlap: 03-renderer no longer shares util.ts.
      writeFileSync(join(workDir, 'corpus', '03-renderer.md'),
        '---\nid: 03-renderer\npath: Core / Renderer\nstatus: complete\ndepends_on: [02-engine]\nsource_files: [src/renderer/renderer.ts]\n---\n\n# Renderer\n')

      const out = render(workDir)
      expect(out).toContain('0 broken.')
      expect(out).not.toContain('Broken dependency edges')
      expect(out).toContain('No source-file overlap across the corpus.')
    } finally {
      rmSync(workDir, { recursive: true, force: true })
    }
  })
})
