import { readFileSync } from 'node:fs'
import type { AssertNode } from 'livestage/parser'
import type { EngineContext } from '../context.js'
import { resolveDataPath } from '../sources.js'
import { resolveGlobTargets } from '../sources-file-utils.js'
import { extractFrontmatter } from '../frontmatter-utils.js'

export interface AssertResult {
  operator: string
  target: string
  matches: number
  passed: boolean
  vacuous: boolean
}

const MAX_PATTERN_LENGTH = 200
const REDOS_SUSPECT = /(\([^)]*[+*][^)]*\)[+*]|\(\?[^)]*\)[+*][+*]|\.\*.*\.\*)/

// target is a single glob string (e.g. "src/**/*.ts", "README.md"), not a
// directory + separate match= the way @list takes them. Resolves through
// the SAME data-jail check every other source directive uses (resolveDataPath,
// feature 10), so @assert's file access is subject to the identical policy.
// Shared with @list's frontmatter query mode (feature 36) via
// sources-file-utils.ts's resolveGlobTargets.
export function resolveAssertTargets(target: string, ctx: EngineContext): string[] {
  return resolveGlobTargets(target, path => resolveDataPath(path, ctx, '@assert'))
}

export function compilePattern(pattern: string): RegExp | null {
  if (pattern.length > MAX_PATTERN_LENGTH) return null
  if (REDOS_SUSPECT.test(pattern)) return null
  try { return new RegExp(pattern) } catch { return null }
}

function fileContains(path: string, re: RegExp): boolean {
  try { return re.test(readFileSync(path, 'utf8')) } catch { return false }
}

// Dot/bracket-path traversal for json-key: "a.b[0].c". Nested objects and
// array indices only, no "append"/negative-index sugar (that belongs to
// @update-frontmatter's write-time addressing, a different, richer concern).
function getByPath(value: unknown, path: string): { found: boolean; value: unknown } {
  const segments = path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(s => s !== '')
  let cur: unknown = value
  for (const seg of segments) {
    if (cur === null || typeof cur !== 'object') return { found: false, value: undefined }
    const key = /^\d+$/.test(seg) ? Number(seg) : seg
    if (!(key in (cur as Record<string | number, unknown>))) return { found: false, value: undefined }
    cur = (cur as Record<string | number, unknown>)[key]
  }
  return { found: true, value: cur }
}

function readKeyedValue(path: string, key: string): { found: boolean; value: unknown } {
  let content: string
  try { content = readFileSync(path, 'utf8') } catch { return { found: false, value: undefined } }
  if (path.toLowerCase().endsWith('.json')) {
    try { return getByPath(JSON.parse(content), key) } catch { return { found: false, value: undefined } }
  }
  // Frontmatter: top-level field only (matches @read-frontmatter's scope).
  const fm = extractFrontmatter(content)
  if (!fm) return { found: false, value: undefined }
  const topKey = key.split(/[.[]/)[0] ?? key
  const re = new RegExp(`^(${topKey.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}):[ \\t]*(.*)$`, 'm')
  const m = fm.body.match(re)
  if (!m) return { found: false, value: undefined }
  return { found: true, value: (m[2] ?? '').trim() }
}

export function evaluateAssert(node: AssertNode, ctx: EngineContext): AssertResult {
  const targets = resolveAssertTargets(node.target, ctx)
  const matches = targets.length

  switch (node.operator) {
    case 'file-exists':
      return { operator: node.operator, target: node.target, matches, passed: matches > 0, vacuous: false }

    case 'contains': {
      if (matches === 0) return { operator: node.operator, target: node.target, matches, passed: false, vacuous: false }
      const re = node.pattern ? compilePattern(node.pattern) : null
      const passed = re !== null && targets.every(t => fileContains(t, re))
      return { operator: node.operator, target: node.target, matches, passed, vacuous: false }
    }

    case 'some-contains': {
      if (matches === 0) return { operator: node.operator, target: node.target, matches, passed: false, vacuous: false }
      const re = node.pattern ? compilePattern(node.pattern) : null
      const passed = re !== null && targets.some(t => fileContains(t, re))
      return { operator: node.operator, target: node.target, matches, passed, vacuous: false }
    }

    case 'contains-if-present': {
      if (matches === 0) return { operator: node.operator, target: node.target, matches, passed: true, vacuous: false }
      const re = node.pattern ? compilePattern(node.pattern) : null
      const passed = re !== null && targets.every(t => fileContains(t, re))
      return { operator: node.operator, target: node.target, matches, passed, vacuous: false }
    }

    case 'absent': {
      if (matches === 0) return { operator: node.operator, target: node.target, matches, passed: true, vacuous: true }
      const re = node.pattern ? compilePattern(node.pattern) : null
      const passed = re !== null && !targets.some(t => fileContains(t, re))
      return { operator: node.operator, target: node.target, matches, passed, vacuous: false }
    }

    case 'json-key': {
      if (matches === 0) return { operator: node.operator, target: node.target, matches, passed: false, vacuous: false }
      const key = node.key ?? ''
      const passed = key !== '' && targets.every(t => {
        const { found, value } = readKeyedValue(t, key)
        if (!found) return false
        if (node.equals === null) return true
        return String(value) === node.equals
      })
      return { operator: node.operator, target: node.target, matches, passed, vacuous: false }
    }

    default:
      return { operator: node.operator, target: node.target, matches, passed: false, vacuous: false }
  }
}
