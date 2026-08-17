import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handlePostToolUse } from '../../../src/hook/pretooluse.js'
import { stampGeneratedMetadata } from '../../../src/engine/generated-metadata.js'
import { hashFileSet } from '../../../src/engine/content-hash.js'
import { trustDirectory } from '../../../src/engine/security/trust.js'

const repoRoot = join(import.meta.dirname, '..', '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')

// Part 5 (feat/drift-gates): the hook's NEW behavior for a .md read that
// carries the livestage:generated metadata block. Same rule Part 4 holds
// every gate to: each case here performs the actual scenario (a real
// stale/fresh/absent file, a real render), not just asserting the happy
// path.
describe('.md reads carrying the livestage:generated contract', () => {
  let dir: string

  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-gen-md-read-')) })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function read(mdPath: string) {
    return handlePostToolUse({ tool_name: 'Read', tool_input: { file_path: mdPath } })
  }

  it('a .md with no livestage:generated block at all is passed through completely untouched, even with a same-named .stage sibling', () => {
    writeFileSync(join(dir, 'plain.stage'), '# Different content entirely\n')
    writeFileSync(join(dir, 'plain.md'), '# Just a plain markdown file\n\nNo block here.\n')
    const result = read(join(dir, 'plain.md'))
    expect(result).toEqual({})
  })

  it('clean: committed content already matches a fresh render, no notice, pass-through', () => {
    writeFileSync(join(dir, 'doc.stage'), '# Test Doc\n\nHello, {{ "world" }}.\n')
    // Build the real committed file via the actual render path, so
    // "committed" and "a fresh render" are guaranteed to agree going in.
    const freshBody = execFileSync('node', [cliEntry, 'render', 'doc.stage'], { cwd: dir, encoding: 'utf8' })
    const stamped = stampGeneratedMetadata(freshBody.endsWith('\n') ? freshBody : `${freshBody}\n`, {
      // Deliberately wrong hash: forces the render-and-compare path
      // rather than the hash-shortcut, so this test exercises the
      // "content matched after a real render" branch specifically.
      source: 'doc.stage', version: '1.0.2', contentHash: 'deliberately-stale-hash-to-force-the-render-and-compare-path', degraded: false,
    })
    writeFileSync(join(dir, 'doc.md'), stamped)

    const result = read(join(dir, 'doc.md'))
    expect(result).toEqual({})
  })

  it('hash unchanged: the source is never re-rendered at all (the hot-path property Part 5.2 exists for)', () => {
    // A script with a side effect (a counter file) proves whether it ran.
    writeFileSync(join(dir, 'counter.txt'), '0')
    writeFileSync(join(dir, 'doc.stage'),
      '@code language="javascript" label="r" visible="false"\n' +
      'const fs = require(\'fs\')\n' +
      'const n = Number(fs.readFileSync(\'counter.txt\', \'utf8\')) + 1\n' +
      'fs.writeFileSync(\'counter.txt\', String(n))\n' +
      'console.log(JSON.stringify({n}))\n' +
      '@code-end\nRan {{ r.n }} times.\n')
    mkdirSync(join(dir, '.livestage'))
    writeFileSync(join(dir, '.livestage', 'policy.json'), JSON.stringify({ code: { languages: ['javascript'], timeout: 10000, runners: {} } }))
    const homeDir = mkdtempSync(join(tmpdir(), 'ls-gen-md-trust-'))
    trustDirectory(dir, homeDir)

    try {
      const freshBody = execFileSync('node', [cliEntry, 'render', 'doc.stage', '--home-dir', homeDir], { cwd: dir, encoding: 'utf8' })
      expect(readFileSync(join(dir, 'counter.txt'), 'utf8')).toBe('1') // the render above ran the script once

      const realHash = hashFileSet([join(dir, 'doc.stage')])
      const stamped = stampGeneratedMetadata(freshBody.endsWith('\n') ? freshBody : `${freshBody}\n`, {
        source: 'doc.stage', version: '1.0.2', contentHash: realHash, degraded: false,
      })
      writeFileSync(join(dir, 'doc.md'), stamped)

      const result = read(join(dir, 'doc.md'))
      expect(result).toEqual({})
      // Still 1: the hash matched, so handlePostToolUse never re-ran the
      // script at all.
      expect(readFileSync(join(dir, 'counter.txt'), 'utf8')).toBe('1')
    } finally {
      rmSync(homeDir, { recursive: true, force: true })
    }
  })

  it('stale, field absent (the conservative default): committed served, WITH a notice naming the source and the regen command', () => {
    writeFileSync(join(dir, 'doc.stage'), '# Fresh Version\n')
    const stamped = stampGeneratedMetadata('# Old Committed Version\n', {
      source: 'doc.stage', version: '1.0.2', contentHash: 'stale-hash', degraded: false,
    })
    writeFileSync(join(dir, 'doc.md'), stamped)

    const result = read(join(dir, 'doc.md'))
    const content = result.hookSpecificOutput?.updatedToolOutput.content ?? ''
    expect(content).toContain('STALE')
    expect(content).toContain('doc.stage')
    expect(content).toContain('Old Committed Version')
    expect(content).not.toContain('Fresh Version')
  })

  it('stale, field explicitly false: same as absent, committed served with a notice (an explicit opt-out still gets the notice, only "true" changes WHAT is served, not whether a notice appears)', () => {
    writeFileSync(join(dir, 'doc.stage'), '# Fresh Version\n')
    const stamped = stampGeneratedMetadata('# Old Committed Version\n', {
      source: 'doc.stage', version: '1.0.2', contentHash: 'stale-hash', degraded: false, regenerateOnRead: false,
    })
    writeFileSync(join(dir, 'doc.md'), stamped)

    const result = read(join(dir, 'doc.md'))
    const content = result.hookSpecificOutput?.updatedToolOutput.content ?? ''
    expect(content).toContain('STALE')
    expect(content).toContain('Old Committed Version')
    expect(content).not.toContain('Fresh Version')
  })

  it('stale, field true: a FRESH render is served instead, with a notice naming the source and stating this is a live render, not the committed bytes', () => {
    writeFileSync(join(dir, 'doc.stage'), '# Fresh Version\n')
    const stamped = stampGeneratedMetadata('# Old Committed Version\n', {
      source: 'doc.stage', version: '1.0.2', contentHash: 'stale-hash', degraded: false, regenerateOnRead: true,
    })
    writeFileSync(join(dir, 'doc.md'), stamped)

    const result = read(join(dir, 'doc.md'))
    const content = result.hookSpecificOutput?.updatedToolOutput.content ?? ''
    expect(content).toContain('STALE')
    expect(content).toContain('FRESH')
    expect(content).toContain('doc.stage')
    expect(content).toContain('Fresh Version')
    expect(content).not.toContain('Old Committed Version')
  })

  it('the source .stage file is missing entirely: committed served, with a "could not verify" notice, never nothing, never an error', () => {
    // No doc.stage written at all.
    const stamped = stampGeneratedMetadata('# Committed Content\n', {
      source: 'doc.stage', version: '1.0.2', contentHash: 'whatever', degraded: false,
    })
    writeFileSync(join(dir, 'doc.md'), stamped)

    const result = read(join(dir, 'doc.md'))
    const content = result.hookSpecificOutput?.updatedToolOutput.content ?? ''
    expect(content).toContain('Could not verify')
    expect(content).toContain('Committed Content')
  })
})
