import { describe, it, expect } from 'vitest'
import { globToRegex } from '../../../src/engine/sources-file-utils.js'

// Found while building @assert (feature 26, wave 3): globToRegex treated
// `**` as a plain inline .* via string replacement, which required a
// literal `/` immediately before the match. `**/*.ts` matched `sub/a.ts`
// but silently excluded the top-level `a.ts`, affecting every caller
// (@list, @count, @assert's target resolution). Fixed to the standard glob
// convention: a `**` path segment matches zero or more directories,
// including none.
describe('globToRegex', () => {
  it('a leading **/ matches both the top level and any depth', () => {
    const re = globToRegex('**/*.ts')
    expect(re.test('a.ts')).toBe(true)
    expect(re.test('sub/a.ts')).toBe(true)
    expect(re.test('sub/deep/a.ts')).toBe(true)
    expect(re.test('a.js')).toBe(false)
  })

  it('a mid-pattern **/ matches zero or more directories after a fixed prefix', () => {
    const re = globToRegex('src/**/*.ts')
    expect(re.test('src/a.ts')).toBe(true)
    expect(re.test('src/sub/a.ts')).toBe(true)
    expect(re.test('other/a.ts')).toBe(false)
  })

  it('a trailing /** matches everything under a directory', () => {
    const re = globToRegex('src/**')
    expect(re.test('src/a.ts')).toBe(true)
    expect(re.test('src/sub/a.ts')).toBe(true)
    expect(re.test('other.ts')).toBe(false)
  })

  it('a bare ** matches anything', () => {
    const re = globToRegex('**')
    expect(re.test('a.ts')).toBe(true)
    expect(re.test('sub/a.ts')).toBe(true)
  })

  it('a single * still does not cross directory boundaries', () => {
    const re = globToRegex('*.ts')
    expect(re.test('a.ts')).toBe(true)
    expect(re.test('sub/a.ts')).toBe(false)
  })

  it('? matches exactly one non-slash character', () => {
    const re = globToRegex('a?.ts')
    expect(re.test('ab.ts')).toBe(true)
    expect(re.test('a.ts')).toBe(false)
    expect(re.test('abc.ts')).toBe(false)
  })

  it('literal regex metacharacters in the pattern are escaped', () => {
    const re = globToRegex('a+b.ts')
    expect(re.test('a+b.ts')).toBe(true)
    expect(re.test('aab.ts')).toBe(false)
  })
})
