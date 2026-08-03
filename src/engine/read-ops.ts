// Read-side directive executors that complement write-ops.ts:
//   @read-frontmatter  — read a single top-level YAML frontmatter field
//   @hash              — compute a hash of a file's content
//
// Both are read-only and jail against the data root (allowed_data_paths).

import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { ReadFrontmatterNode, ReadBodyNode, HashNode } from 'livestage/parser'
import type { EngineContext } from './context.js'
import { checkDataPath } from './security/filesystem.js'
import { expandPattern } from './security/path-expand.js'
import { interpolatePathSoft } from './engine-include.js'
import { readFrontmatterField, parseFrontmatterRow } from './frontmatter-utils.js'
import { resolveDataJail } from './file-access.js'
import { loadSchema } from './schema/loader.js'
import { validateFieldValue } from './schema/validate.js'
import { readMarkdownBody } from './sources.js'

function buildExpandContext(ctx: EngineContext) {
  const env: Record<string, string> = { ...ctx.env, ...ctx.envFiles }
  const expandCtx: import('./security/path-expand.js').PatternExpandContext = { env }
  const skillDir = ctx.skillContext?.skillDir
  const sessionId = ctx.skillContext?.sessionId
  if (skillDir) expandCtx.skillDir = skillDir
  if (sessionId) expandCtx.sessionId = sessionId
  return expandCtx
}

function resolveReadPath(rawPath: string, ctx: EngineContext, directive: string): string | null {
  // {{ expr }} interpolation + ${VAR} expansion, same order as @render-template's
  // `to=` path. Without the {{ }} step a top-level read like
  // `@read-frontmatter path="${CWD}/.mdd/docs/{{ id }}.md"` keeps the literal
  // {{ id }} (it only resolved inside @foreach, where the body is re-rendered).
  const expanded = interpolatePathSoft(expandPattern(rawPath, buildExpandContext(ctx)), ctx)
  const dataJail = resolveDataJail(ctx)
  if (!dataJail) {
    ctx.warnings.push(`${directive}: no data jail for path: ${rawPath}`)
    return null
  }
  const abs = isAbsolute(expanded) ? expanded : resolve(dataJail, expanded)
  const check = checkDataPath(abs, dataJail, ctx.security.allowedDataPaths, ctx.security.filesystemConfig)
  if (check.level === 'blocked') {
    ctx.warnings.push(`SECURITY_ALERT: ${directive} blocked — ${check.reason}: ${rawPath}`)
    return null
  }
  if (check.level === 'alert') {
    ctx.warnings.push(`SECURITY_ALERT: ${directive} sensitive path accessed — ${check.reason}: ${rawPath}`)
  }
  return abs
}

export function executeReadFrontmatter(node: ReadFrontmatterNode, ctx: EngineContext): string {
  const label = node.args['label']
  if (!node.path || (!node.field && !label)) {
    ctx.warnings.push('@read-frontmatter: path= and (field= or label=) are required')
    return ''
  }
  const target = resolveReadPath(node.path, ctx, '@read-frontmatter')
  if (!target) return ''
  if (!existsSync(target)) {
    ctx.warnings.push(`@read-frontmatter: file does not exist: ${node.path}`)
    return ''
  }
  let content: string
  try { content = readFileSync(target, 'utf8') } catch (err) {
    ctx.warnings.push(`@read-frontmatter: cannot read ${node.path}: ${String(err)}`)
    return ''
  }

  // Read-side schema check (feature 32, F-SCHEMA): only @update-frontmatter's
  // write path was validated before; a document can still declare a class,
  // drift out of conformance by hand-editing or predating the schema, and
  // be read here without anyone finding out. Warn, never block, reads are
  // pure and must still return the (possibly nonconforming) value; this is
  // a visibility gate, not a gate on the read itself.
  const docClass = readFrontmatterField(content, 'class')
  const schema = docClass ? loadSchema(docClass, ctx.cwd) : null
  if (schema?.error) {
    ctx.warnings.push(`@read-frontmatter: schema error for class "${docClass}": ${schema.error}`)
  }

  // Struct mode (feature 36, F-FM-QUERY): no field= given, capture every
  // top-level frontmatter field under label= so {{ label.field }} dot-access
  // works, including inside a @foreach body re-executed each iteration.
  if (!node.field) {
    const row = parseFrontmatterRow(content)
    if (row === null) {
      ctx.warnings.push(`@read-frontmatter: ${node.path} has no YAML frontmatter block`)
      return ''
    }
    if (schema?.schema) {
      for (const field of Object.keys(schema.schema.fields)) {
        const fieldValue = row[field]
        if (typeof fieldValue !== 'string') continue // schema fields are scalar-typed; list values are unconstrained here
        const result = validateFieldValue(schema.schema, field, fieldValue)
        if (!result.valid) ctx.warnings.push(`@read-frontmatter: ${node.path} does not conform to its declared schema, ${result.error}`)
      }
    }
    ctx.data[label!] = row
    return ''
  }
  const value = readFrontmatterField(content, node.field)
  if (value === null) {
    ctx.warnings.push(`@read-frontmatter: ${node.path} has no YAML frontmatter block`)
    return ''
  }
  if (schema?.schema) {
    const result = validateFieldValue(schema.schema, node.field, value)
    if (!result.valid) ctx.warnings.push(`@read-frontmatter: ${node.path} does not conform to its declared schema, ${result.error}`)
  }
  if (label) ctx.envFiles[label] = value
  return value
}

export function executeReadBody(node: ReadBodyNode, ctx: EngineContext): string {
  if (!node.path) {
    ctx.warnings.push('@read-body: path= is required')
    return ''
  }
  const target = resolveReadPath(node.path, ctx, '@read-body')
  if (!target) return ''
  if (!existsSync(target)) {
    ctx.warnings.push(`@read-body: file does not exist: ${node.path}`)
    return ''
  }
  // 'section' in node.args (not node.section's truthiness) distinguishes
  // "section= omitted" (whole body) from "section= explicitly empty" (a
  // genuine miss, parity with read_section(path, "")); node.section is
  // always a string so `|| undefined` would collapse both to the same
  // "whole body" behavior, silently widening an empty interpolated
  // section= to the entire document.
  const hasSection = 'section' in node.args
  const value = readMarkdownBody(target, hasSection ? node.section : undefined)
  if (hasSection && node.section && value === '') {
    ctx.warnings.push(`@read-body: no heading matching "${node.section}" in ${node.path}`)
  }
  const label = node.args['label']
  if (label) ctx.envFiles[label] = value
  return value
}

export function executeHash(node: HashNode, ctx: EngineContext): string {
  if (!node.path) {
    ctx.warnings.push('@hash: path= is required')
    return ''
  }
  const target = resolveReadPath(node.path, ctx, '@hash')
  if (!target) return ''
  if (!existsSync(target)) {
    ctx.warnings.push(`@hash: file does not exist: ${node.path}`)
    return ''
  }
  const algo = (node.args['algo'] ?? 'sha256').toLowerCase()
  const lengthStr = node.args['length']
  const length = lengthStr ? parseInt(lengthStr, 10) : NaN
  const excludeLine = node.args['exclude-line']
  let content: string
  try { content = readFileSync(target, 'utf8') } catch (err) {
    ctx.warnings.push(`@hash: cannot read ${node.path}: ${String(err)}`)
    return ''
  }
  if (excludeLine) {
    try {
      const re = new RegExp(excludeLine)
      content = content
        .split('\n')
        .filter(line => !re.test(line))
        .join('\n')
    } catch (err) {
      ctx.warnings.push(`@hash: invalid exclude-line regex: ${String(err)}`)
      return ''
    }
  }
  let digest: string
  try {
    digest = createHash(algo).update(content).digest('hex')
  } catch (err) {
    ctx.warnings.push(`@hash: unsupported algo "${algo}": ${String(err)}`)
    return ''
  }
  const result = !isNaN(length) && length > 0 ? digest.slice(0, length) : digest
  const label = node.args['label']
  if (label) ctx.envFiles[label] = result
  return result
}
