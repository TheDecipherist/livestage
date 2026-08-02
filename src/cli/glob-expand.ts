import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { globToRegex, walkDir } from '../engine/sources-file-utils.js'

function hasGlobChars(s: string): boolean {
  return /[*?[]/.test(s)
}

// validate/assert accept <file|glob> (feature 28, CI Mode): a bare path is
// passed through unchanged (existence is the caller's problem, same as
// today), a glob is expanded relative to cwd using the same glob semantics
// as @list/@assert (globToRegex/walkDir).
export function expandFileGlob(pattern: string, cwd: string): string[] {
  if (!hasGlobChars(pattern)) return [pattern]
  const firstGlobIdx = pattern.search(/[*?[]/)
  const slashBefore = pattern.lastIndexOf('/', firstGlobIdx)
  const baseDir = slashBefore >= 0 ? pattern.slice(0, slashBefore) : '.'
  const rest = slashBefore >= 0 ? pattern.slice(slashBefore + 1) : pattern
  const fullBase = resolve(cwd, baseDir)
  if (!existsSync(fullBase)) return []
  const matchRe = globToRegex(rest)
  const base = baseDir === '.' ? '' : `${baseDir}/`
  return walkDir(fullBase, '', matchRe, 'files', 0, -1).map(rel => `${base}${rel}`).sort()
}
