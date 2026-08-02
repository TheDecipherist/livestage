import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expandFileGlob } from '../../../src/cli/glob-expand.js'

describe('expandFileGlob', () => {
  let dir: string

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'ls-glob-expand-'))
    writeFileSync(join(dir, 'a.stage'), '')
    writeFileSync(join(dir, 'b.stage'), '')
    mkdirSync(join(dir, 'sub'))
    writeFileSync(join(dir, 'sub', 'c.stage'), '')
  })

  afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

  it('a bare path with no glob characters passes through unchanged', () => {
    expect(expandFileGlob('a.stage', dir)).toEqual(['a.stage'])
  })

  it('a top-level glob matches files at cwd', () => {
    expect(expandFileGlob('*.stage', dir)).toEqual(['a.stage', 'b.stage'])
  })

  it('a **/ glob matches files at every depth including the top level', () => {
    expect(expandFileGlob('**/*.stage', dir)).toEqual(['a.stage', 'b.stage', 'sub/c.stage'])
  })

  it('no matches returns an empty array', () => {
    expect(expandFileGlob('*.nope', dir)).toEqual([])
  })
})
