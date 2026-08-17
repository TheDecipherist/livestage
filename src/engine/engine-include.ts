import { readFileSync } from 'node:fs'
import { resolve, dirname, join, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ASTNode, IncludeNode, ImportNode } from 'livestage/parser'
import { parse } from 'livestage/parser'
import { type EngineContext, type Connection } from './context.js'
import { evalCondition, evalExpression } from './conditions.js'
import { checkSourcePath } from './security/filesystem.js'
import { expandPattern } from './security/path-expand.js'
import { buildExpandContext } from './expand-context.js'
import { cacheKey, readCache, writeCache } from './cache.js'

/**
 * Expand ${VAR} placeholders in @import / @include source paths.
 *
 * Without this, `@include ${CLAUDE_SKILL_DIR}/templates/foo.md` is treated
 * as a literal path containing the unexpanded variable and fails. The
 * write directives (@copy, @mkdir, @append-if-missing) already expand the
 * same set; this brings the source directives to parity.
 */
function expandImportPath(rawPath: string, ctx: EngineContext): string {
  return expandPattern(rawPath, buildExpandContext(ctx))
}

export class FatalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FatalError'
  }
}

const INTERP_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g

function interpolatePathExpressions(path: string, ctx: EngineContext): string {
  return path.replace(INTERP_RE, (_, expr: string) => {
    const value = evalExpression(expr.trim(), ctx)
    if (value === '' || value === 'null') {
      throw new FatalError(
        `@include: {{ ${expr.trim()} }} evaluated to empty in path "${path}", cannot resolve file`,
      )
    }
    return value
  })
}

/**
 * Non-fatal variant of interpolatePathExpressions. Used by data/write ops
 * (@update-frontmatter, @hash, @read, @list, @copy, @mkdir, etc.) which
 * should warn-and-continue on an empty interpolation rather than throwing,
 * multi-phase document renders walk every phase, and phases that don't
 * apply to the current invocation legitimately produce empty path
 * interpolations. Letting them throw aborts the whole render.
 */
export function interpolatePathSoft(path: string, ctx: EngineContext): string {
  return path.replace(INTERP_RE, (_, expr: string) => {
    const value = evalExpression(expr.trim(), ctx)
    return value === 'null' ? '' : value
  })
}

/**
 * Security (bug B1, 2026-08-17): quotes a value for safe splicing into a
 * shell command string. checkShellCommand's allowlist only validates that
 * the FULLY-RESOLVED command string matches an allow pattern; it never
 * parses shell syntax, so a raw substituted value containing ;/&&/||/|/
 * backticks/$() is interpreted by the real shell that ultimately runs the
 * command (spawnSync/execSync with shell:true), chaining further commands
 * after an allowed prefix. Wrapping the value in single quotes (escaping
 * any embedded ' as '\'', the standard POSIX technique) makes it an inert
 * literal argument regardless of what characters it contains, so the
 * allowlist still permits exactly the same commands it always did, but
 * nothing past the quote boundary can execute.
 */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

/**
 * Shell-command variant of interpolatePathSoft: resolves {{ }} the same
 * way, but shell-quotes the resolved value instead of splicing it in as
 * plain text. Used ONLY for the command= field of @query/@test/@check and
 * a pipe's shell stage, the fields that reach a real shell; every other
 * interpolatePathSoft call site (paths, @update-frontmatter's value) is
 * unaffected and keeps plain interpolation.
 */
export function interpolateShellSafe(command: string, ctx: EngineContext): string {
  return command.replace(INTERP_RE, (_, expr: string) => {
    const value = evalExpression(expr.trim(), ctx)
    if (value === 'null' || value === '') return ''
    return shellQuote(value)
  })
}

export function versionIsNewer(required: string, installed: string): boolean {
  const [rMaj = 0, rMin = 0] = required.split('.').map(Number)
  const [iMaj = 0, iMin = 0] = installed.split('.').map(Number)
  if (rMaj !== iMaj) return rMaj > iMaj
  return rMin > iMin
}

export function loadStdlib(ctx: EngineContext): void {
  // This module's own directory sits at a different depth depending on
  // build target: dist/engine/ under the tsc build (stdlib.md copied
  // alongside it), but dist/ directly under the esbuild single-file bundle
  // (feature 41), which inlines this file's code with no engine/
  // subdirectory at all. Try both; a bare checkout (CR-8, feature 37) with
  // only dist/livestage.js present needs the bundle-relative one.
  const here = dirname(fileURLToPath(import.meta.url))
  const candidates = [join(here, 'stdlib.md'), join(here, 'engine', 'stdlib.md')]
  let lastErr: unknown = null
  for (const stdlibPath of candidates) {
    try {
      const source = readFileSync(stdlibPath, 'utf8')
      const ast = parse(source, { filePath: stdlibPath, inImport: true })
      for (const n of ast.nodes) {
        if (n.type === 'define') ctx.macros[n.name] = { body: n.body, params: n.params }
      }
      return
    } catch (err) {
      lastErr = err
    }
  }
  ctx.warnings.push(`stdlib load failed, macro definitions from stdlib will not be available: ${String(lastErr)}`)
}

export function executeImport(node: ImportNode, ctx: EngineContext): void {
  // Expand ${VAR} patterns (CLAUDE_SKILL_DIR, HOME, env vars) before
  // resolving. Otherwise paths like ${CLAUDE_SKILL_DIR}/templates/foo.md
  // would be treated as literal directories.
  const expanded = expandImportPath(node.path, ctx)
  const full = isAbsolute(expanded) ? expanded : resolve(ctx.docDir, expanded)
  const sourceJail = ctx.security.sourceJail ?? ctx.security.jailRoot ?? ctx.docDir
  const check = checkSourcePath(full, sourceJail, ctx.security.allowedSourcePaths, ctx.security.filesystemConfig)
  if (check.level === 'blocked') {
    ctx.warnings.push(`@import: ${check.reason} (${node.path}), skipped`)
    return
  }
  if (check.level === 'alert') ctx.warnings.push(`@import SECURITY_ALERT: ${check.reason} (${node.path})`)

  if (ctx.completedSet.has(full)) return
  if (ctx.resolutionStack.has(full)) {
    const chain = [...ctx.resolutionStack, full].join(' → ')
    throw new FatalError(`Circular reference detected: ${chain}`)
  }
  let source: string
  try { source = readFileSync(full, 'utf8') } catch (err) {
    ctx.warnings.push(`@import: cannot read file "${node.path}": ${String(err)}`)
    return
  }
  const ast = parse(source, { filePath: full, inImport: true })
  if (!ast.isLiveStage) return
  ctx.resolutionStack.add(full)
  const importCtx = { ...ctx, docDir: dirname(full) }
  for (const n of ast.nodes) {
    if (n.type === 'env' && n.fallback !== null) ctx.envFallbacks[n.name] = n.fallback
    else if (n.type === 'define') ctx.macros[n.name] = { body: n.body, params: n.params }
    else if (n.type === 'import') executeImport(n, importCtx)
  }
  ctx.resolutionStack.delete(full)
  ctx.completedSet.add(full)
}

export function executeInclude(
  node: IncludeNode,
  ctx: EngineContext,
  walkNodesFn: (nodes: ASTNode[], ctx: EngineContext) => string[],
): string {
  if (node.condition !== null && !evalCondition(node.condition, ctx)) return ''

  // Mock cache (feature 35 convention): serve a fixture's raw content in
  // place of resolving and rendering the real include target. Resolved
  // against the source jail, not the data jail, since @include operates on
  // other .stage documents, not data files.
  if (node.cache?.mode === 'mock' && node.cache.mockPath) {
    const mockExpanded = expandImportPath(node.cache.mockPath, ctx)
    const mockFull = isAbsolute(mockExpanded) ? mockExpanded : resolve(ctx.docDir, mockExpanded)
    const mockJail = ctx.security.sourceJail ?? ctx.security.jailRoot ?? ctx.docDir
    const mockCheck = checkSourcePath(mockFull, mockJail, ctx.security.allowedSourcePaths, ctx.security.filesystemConfig)
    if (mockCheck.level === 'blocked') return ''
    try { return readFileSync(mockFull, 'utf8') } catch { return '' }
  }

  const expanded = interpolatePathExpressions(expandImportPath(node.path, ctx), ctx)
  const full = isAbsolute(expanded) ? expanded : resolve(ctx.docDir, expanded)
  const sourceJail = ctx.security.sourceJail ?? ctx.security.jailRoot ?? ctx.docDir
  const check = checkSourcePath(full, sourceJail, ctx.security.allowedSourcePaths, ctx.security.filesystemConfig)
  if (check.level === 'blocked') throw new FatalError(`@include blocked: ${check.reason}`)
  if (check.level === 'alert') ctx.warnings.push(`@include SECURITY_ALERT: ${check.reason} (${node.path})`)

  // Every security check above already ran live; a session/persist cache
  // hit only ever skips the read-parse-render below, never the jail check.
  const useCache = node.cache !== null && node.cache.mode !== 'mock'
  const key = useCache ? cacheKey('include', { path: node.path }) : null
  if (key && node.cache) {
    const cached = readCache(key, node.cache, ctx.docDir, ctx.cwd)
    if (cached !== null) return cached
  }

  if (ctx.resolutionStack.has(full)) {
    const chain = [...ctx.resolutionStack, full].join(' → ')
    throw new FatalError(`Circular reference detected: ${chain}`)
  }
  let source: string
  try { source = readFileSync(full, 'utf8') } catch (err) {
    const displayPath = expanded !== node.path ? `"${expanded}" (from "${node.path}")` : `"${node.path}"`
    ctx.warnings.push(`@include: cannot read file ${displayPath}: ${String(err)}`)
    return ''
  }
  const ast = parse(source, { filePath: full })
  if (!ast.isLiveStage) return ''
  ctx.resolutionStack.add(full)
  const includeConns: Record<string, Connection> = { ...ctx.connections }
  const includeLocalNames = new Set<string>()
  const includeCtx = { ...ctx, docDir: dirname(full), phase: null, connections: includeConns, localConnectionNames: includeLocalNames }
  try {
    const out = walkNodesFn(ast.nodes, includeCtx).join('\n')
    ctx.resolutionStack.delete(full)
    ctx.completedSet.add(full)
    for (const [name, conn] of Object.entries(includeConns)) {
      if (!includeLocalNames.has(name)) ctx.connections[name] = conn
    }
    if (key && node.cache) {
      writeCache(key, out, node.cache, ctx.security.filesystemConfig, 'include', ctx.cwd)
    }
    return out
  } catch (err) {
    ctx.resolutionStack.delete(full)
    throw err
  }
}
