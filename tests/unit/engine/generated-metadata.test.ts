import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  stampGeneratedMetadata, parseGeneratedMetadata, extractGeneratedMetadataBlock, stripGeneratedMetadataBlock,
  recomputeContentHash,
} from '../../../src/engine/generated-metadata.js'
import { hashFileSet } from '../../../src/engine/content-hash.js'

describe('generated-metadata (feat/drift-gates, Part 5.1)', () => {
  it('stamps an HTML comment block, not YAML --- frontmatter', () => {
    const out = stampGeneratedMetadata('# Hello\n\nBody.\n', {
      source: 'README.stage', version: '1.0.2', contentHash: 'abc123', degraded: false,
    })
    expect(out).toMatch(/^<!-- livestage:generated\n/)
    expect(out).not.toMatch(/^---\n/)
    expect(out).toContain('# Hello')
  })

  it('round-trips every field through parseGeneratedMetadata', () => {
    const now = new Date('2026-08-17T12:00:00.000Z')
    const out = stampGeneratedMetadata('body', {
      source: 'CLAUDE.stage', version: '1.0.2', contentHash: 'deadbeef', degraded: true, now,
    })
    const parsed = parseGeneratedMetadata(out)
    expect(parsed).toEqual({
      livestage_source: 'CLAUDE.stage',
      livestage_updated_at: '2026-08-17T12:00:00.000Z',
      livestage_version: '1.0.2',
      livestage_content_hash: 'deadbeef',
      livestage_degraded: 'true',
    })
  })

  it('omits livestage_regenerate_on_read entirely when not given (the conservative default is absence, not a written "absent" value)', () => {
    const out = stampGeneratedMetadata('body', { source: 's', version: 'v', contentHash: 'h', degraded: false })
    expect(out).not.toContain('livestage_regenerate_on_read')
  })

  it('writes livestage_regenerate_on_read when explicitly given, true or false', () => {
    const trueOut = stampGeneratedMetadata('body', { source: 's', version: 'v', contentHash: 'h', degraded: false, regenerateOnRead: true })
    expect(parseGeneratedMetadata(trueOut)?.livestage_regenerate_on_read).toBe('true')
    const falseOut = stampGeneratedMetadata('body', { source: 's', version: 'v', contentHash: 'h', degraded: false, regenerateOnRead: false })
    expect(parseGeneratedMetadata(falseOut)?.livestage_regenerate_on_read).toBe('false')
  })

  it('a file with no metadata block parses as null, not an empty object', () => {
    expect(parseGeneratedMetadata('# Plain markdown\n\nNo block here.\n')).toBeNull()
    expect(extractGeneratedMetadataBlock('# Plain markdown\n')).toBeNull()
  })

  it('stripGeneratedMetadataBlock removes exactly the block, nothing else', () => {
    const rendered = '# Hello\n\nBody content.\n'
    const stamped = stampGeneratedMetadata(rendered, { source: 's', version: 'v', contentHash: 'h', degraded: false })
    expect(stripGeneratedMetadataBlock(stamped)).toBe(rendered)
  })

  it('stripGeneratedMetadataBlock on a file with no block is a no-op', () => {
    const plain = '# No block\n'
    expect(stripGeneratedMetadataBlock(plain)).toBe(plain)
  })

  describe('recomputeContentHash', () => {
    let dir: string
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'ls-gen-meta-hash-')) })
    afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

    it('with no livestage_hash_inputs, hashes just the resolved livestage_source file', () => {
      writeFileSync(join(dir, 'doc.stage'), 'content v1')
      const hash1 = recomputeContentHash({ livestage_source: 'doc.stage' }, dir)
      expect(hash1).toBe(hashFileSet([join(dir, 'doc.stage')]))
      writeFileSync(join(dir, 'doc.stage'), 'content v2')
      const hash2 = recomputeContentHash({ livestage_source: 'doc.stage' }, dir)
      expect(hash2).not.toBe(hash1)
    })

    it('with livestage_hash_inputs, hashes the declared glob(s) instead', () => {
      mkdirSync(join(dir, 'data'))
      writeFileSync(join(dir, 'doc.stage'), 'stage content')
      writeFileSync(join(dir, 'data', 'a.md'), 'a')
      writeFileSync(join(dir, 'data', 'b.md'), 'b')
      const hash1 = recomputeContentHash({ livestage_source: 'doc.stage', livestage_hash_inputs: 'data/*.md' }, dir)
      // Changing doc.stage itself does NOT affect the hash: only the
      // declared glob is covered, matching build.ts's own semantics.
      writeFileSync(join(dir, 'doc.stage'), 'changed, but not in the declared inputs')
      const hash2 = recomputeContentHash({ livestage_source: 'doc.stage', livestage_hash_inputs: 'data/*.md' }, dir)
      expect(hash2).toBe(hash1)
      // Changing a file the glob DOES cover changes the hash.
      writeFileSync(join(dir, 'data', 'a.md'), 'a changed')
      const hash3 = recomputeContentHash({ livestage_source: 'doc.stage', livestage_hash_inputs: 'data/*.md' }, dir)
      expect(hash3).not.toBe(hash1)
    })

    it('returns null when there is no livestage_source to resolve against', () => {
      expect(recomputeContentHash({}, dir)).toBeNull()
    })
  })
})
