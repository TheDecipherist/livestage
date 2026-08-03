// @update-frontmatter: replace a single YAML frontmatter field value in-place.
//
// Shares the write-enabled + writeJail + allowed_write_paths security gate,
// via checkWritePath(), that the donor's scaffolding write-ops (@mkdir, @copy,
// @touch, @append-if-missing) also used; those directives are not carried.

import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { resolve, isAbsolute, dirname, basename } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { UpdateFrontmatterNode } from 'livestage/parser'
import type { EngineContext } from './context.js'
import { checkWritePath } from './security/filesystem.js'
import { expandPattern } from './security/path-expand.js'
import { interpolatePathSoft } from './engine-include.js'
import { unescapeBraces } from './macros.js'
import { extractFrontmatter, fieldRegex, readFrontmatterField } from './frontmatter-utils.js'
import { buildExpandContext } from './expand-context.js'
import { loadSchema } from './schema/loader.js'
import { validateFieldValue } from './schema/validate.js'

// Atomic write: same directory as the target (so rename() is guaranteed to
// be same-filesystem, hence atomic on POSIX), write the full content to a
// temp file, then rename over the target. A crash or failure mid-write
// leaves the temp file, never a truncated/partial target (business rule 3).
function writeFileAtomic(target: string, content: string): void {
  const tmpPath = resolve(dirname(target), `.${basename(target)}.${randomBytes(6).toString('hex')}.tmp`)
  writeFileSync(tmpPath, content, 'utf8')
  try {
    renameSync(tmpPath, target)
  } catch (err) {
    try { unlinkSync(tmpPath) } catch { /* best effort cleanup */ }
    throw err
  }
}

function ensureWriteEnabled(ctx: EngineContext, directive: string): boolean {
  if (!ctx.security.writeEnabled) {
    ctx.warnings.push(`${directive}: filesystem write is disabled — enable with filesystem.write_enabled in security.json`)
    return false
  }
  if (!ctx.security.writeJail) {
    ctx.warnings.push(`${directive}: no write jail resolved — check security.json filesystem.write_root`)
    return false
  }
  return true
}

function resolveWritePath(rawPath: string, ctx: EngineContext, directive: string): string | null {
  // ${VAR} expansion at use time so users can reference CLAUDE_SKILL_DIR etc.
  const varExpanded = expandPattern(rawPath, buildExpandContext(ctx))
  // {{ expression }} interpolation so paths like
  //   "${CWD}/.mdd/docs/{{ feature_id }}.md"
  // resolve both halves. Without this, the engine substitutes ${CWD} but
  // leaves {{ feature_id }} literal in the path, then complains the file
  // doesn't exist with the literal {{ }} still visible in the warning.
  const expanded = interpolatePathSoft(varExpanded, ctx)
  const writeJail = ctx.security.writeJail!
  const abs = isAbsolute(expanded) ? expanded : resolve(writeJail, expanded)
  const check = checkWritePath(abs, writeJail, ctx.security.allowedWritePaths, ctx.security.filesystemConfig)
  if (check.level === 'blocked') {
    ctx.warnings.push(`SECURITY_ALERT: ${directive} write blocked — ${check.reason}: ${rawPath}`)
    return null
  }
  if (check.level === 'alert') {
    ctx.warnings.push(`SECURITY_ALERT: ${directive} sensitive write — ${check.reason}: ${rawPath}`)
  }
  return abs
}

/**
 * @update-frontmatter — replace a single YAML frontmatter field value in-place.
 *
 * Frontmatter is the leading `---` ... `---` block. Only top-level scalar
 * fields are supported (`status: complete`, `last_synced: 2026-05-23`).
 * Nested objects, lists, and multi-line scalars are out of scope for v2.0 —
 * use @copy + manual edit for those cases.
 *
 * Idempotent: if the existing value already matches `value`, no write happens.
 * If the field is missing from the frontmatter block, it is appended (above
 * the closing `---`). If the file has no frontmatter block, the operation
 * fails with a warning rather than corrupting the file.
 */
export function executeUpdateFrontmatter(node: UpdateFrontmatterNode, ctx: EngineContext): string {
  if (!ensureWriteEnabled(ctx, '@update-frontmatter')) return ''
  if (!node.path || !node.field) {
    ctx.warnings.push('@update-frontmatter: path= and field= are required')
    return ''
  }
  const target = resolveWritePath(node.path, ctx, '@update-frontmatter')
  if (!target) return ''
  if (!existsSync(target)) {
    ctx.warnings.push(`@update-frontmatter: target does not exist: ${node.path}`)
    return ''
  }
  let content: string
  try { content = readFileSync(target, 'utf8') } catch (err) {
    ctx.warnings.push(`@update-frontmatter failed: cannot read ${node.path}: ${String(err)}`)
    return ''
  }

  const fm = extractFrontmatter(content)
  if (!fm) {
    ctx.warnings.push(`@update-frontmatter: ${node.path} has no YAML frontmatter block (must start with --- ... ---)`)
    return ''
  }
  const fmBody = fm.body
  const fmFull = fm.fullBlock

  // {{ expr }} interpolation on the write value, same mechanism @query's
  // command and every path= attribute already gets. Without this, a value
  // like value="{{ vars.run_id }}" wrote the literal template text into
  // frontmatter instead of the resolved value (found live-verifying the
  // multi-step pattern example, feature 40).
  //
  // unescapeBraces (feature 49): node.value may already have been macro-
  // substituted (a @foreach/@call bound value spliced in with its own
  // braces escaped for safety, see macros.ts). interpolatePathSoft only
  // evaluates AUTHOR-WRITTEN {{ }} (the escaped ones don't match), so the
  // escape survives to here; unescape it now so the WRITTEN value is the
  // real data, not a backslash-mangled copy of it.
  const value = unescapeBraces(interpolatePathSoft(node.value, ctx))

  // Schema pre-write gate (F-SCHEMA, feature 32): if the target document
  // declares a class, and that class has a schema, and the schema
  // constrains this field, the proposed value must satisfy it or the write
  // is blocked before anything touches disk. A document with no class, or
  // a class with no schema file, has nothing to validate against, business
  // rule 2 only gates "once a schema is declared". Scoped to plain
  // top-level scalar fields; list-addressed fields (field[N]) are not
  // schema-checked.
  const docClass = readFrontmatterField(content, 'class')
  if (docClass) {
    const { schema, error: loadError } = loadSchema(docClass, ctx.cwd)
    if (loadError) {
      ctx.warnings.push(`@update-frontmatter: schema error for class "${docClass}": ${loadError}`)
    } else if (schema && !node.field.includes('[')) {
      const result = validateFieldValue(schema, node.field, value)
      if (!result.valid) {
        ctx.warnings.push(`@update-frontmatter: blocked, ${result.error}`)
        return ''
      }
    }
  }

  // Detect list-style field addressing: `field[N].subfield`, `field[N]`,
  // or `field[append]`. These rewrite the block-list YAML inside the
  // frontmatter rather than top-level scalars.
  const listMatch = node.field.match(/^([A-Za-z_][\w-]*)\[(append|\d+)\](?:\.([A-Za-z_][\w-]*))?$/)
  let newFmBody: string
  if (listMatch) {
    const listField = listMatch[1] ?? ''
    const indexToken = listMatch[2] ?? ''
    const subField = listMatch[3]
    const result = updateListField(fmBody, listField, indexToken, subField, value, node.path, ctx)
    if (result === null) return ''  // warning already logged
    if (result === fmBody) return ''  // idempotent no-op
    newFmBody = result
  } else {
    const fieldRe = fieldRegex(node.field)
    if (fieldRe.test(fmBody)) {
      const existingMatch = fmBody.match(fieldRe)
      const existingValue = (existingMatch?.[2] ?? '').trim()
      if (existingValue === value) {
        return '' // idempotent no-op
      }
      newFmBody = fmBody.replace(fieldRe, `$1: ${value}`)
    } else {
      newFmBody = fmBody + `\n${node.field}: ${value}`
    }
  }

  const newContent = content.replace(fmFull, `---\n${newFmBody}\n---\n`)
  try {
    writeFileAtomic(target, newContent)
  } catch (err) {
    ctx.warnings.push(`@update-frontmatter failed: cannot write ${node.path}: ${String(err)}`)
  }
  return ''
}

/**
 * Update a YAML block-list field's items in-place.
 *
 * Supported shapes:
 *   list[append]                 — append a new scalar item to the list
 *   list[N]                      — replace the Nth item's scalar
 *   list[N].sub                  — replace the `sub:` key inside the Nth
 *                                  block-mapping item
 *
 * Returns the new frontmatter body, the input unchanged for idempotent
 * no-ops, or `null` when a warning was emitted (bounds, missing field, etc.).
 */
function updateListField(
  fmBody: string,
  listField: string,
  indexToken: string,
  subField: string | undefined,
  value: string,
  pathForWarn: string,
  ctx: import('./context.js').EngineContext,
): string | null {
  const lines = fmBody.split('\n')
  // Find the listField's anchor line: `listField:` at top level.
  const anchorRe = new RegExp(`^${listField.replace(/[-]/g, '\\-')}:\\s*(.*)$`)
  let anchorIdx = -1
  for (let i = 0; i < lines.length; i++) {
    if (anchorRe.test(lines[i] ?? '')) { anchorIdx = i; break }
  }

  if (anchorIdx === -1) {
    if (indexToken === 'append') {
      // Field absent — create it with the first item.
      return fmBody + `\n${listField}:\n  - ${value}`
    }
    ctx.warnings.push(`@update-frontmatter: ${pathForWarn} has no \`${listField}:\` field`)
    return null
  }

  const inlineAfter = (lines[anchorIdx] ?? '').replace(anchorRe, '$1').trim()
  if (inlineAfter !== '' && inlineAfter !== '[]') {
    ctx.warnings.push(`@update-frontmatter: ${pathForWarn} field \`${listField}\` is not a block-list; inline-list updates are out of scope`)
    return null
  }

  // Collect item ranges: each item starts with `  - ` and extends to (but
  // not including) the next top-level line or the next `  - ` at the same
  // indent.
  const itemStarts: number[] = []
  const itemEnds: number[] = []
  let inList = false
  let listIndent = ''
  for (let i = anchorIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (/^\S/.test(line)) {
      if (inList) itemEnds.push(i)
      break
    }
    const itemMatch = line.match(/^(\s+)-\s/)
    if (itemMatch) {
      listIndent = itemMatch[1] ?? ''
      if (inList && itemStarts.length > itemEnds.length) itemEnds.push(i)
      itemStarts.push(i)
      inList = true
    } else if (line.trim() === '') {
      // Blank line: don't break the list, but treat it as a continuation
      // boundary for items.
      continue
    }
  }
  if (inList && itemStarts.length > itemEnds.length) itemEnds.push(lines.length)
  // If listIndent is unset (zero items so far), default to two spaces.
  if (!listIndent) listIndent = '  '

  if (indexToken === 'append') {
    const insertAt = (itemEnds[itemEnds.length - 1] ?? anchorIdx + 1)
    const newLine = `${listIndent}- ${value}`
    const before = lines.slice(0, insertAt)
    const after = lines.slice(insertAt)
    return [...before, newLine, ...after].join('\n')
  }

  const idx = parseInt(indexToken, 10)
  if (isNaN(idx) || idx < 0 || idx >= itemStarts.length) {
    ctx.warnings.push(`@update-frontmatter: ${pathForWarn} index ${indexToken} out of bounds for \`${listField}\` (has ${itemStarts.length} items)`)
    return null
  }

  const itemStart = itemStarts[idx]!
  const itemEnd = itemEnds[idx] ?? lines.length

  if (!subField) {
    // Scalar replacement of the whole item.
    const newLine = `${listIndent}- ${value}`
    const before = lines.slice(0, itemStart)
    const after = lines.slice(itemEnd)
    return [...before, newLine, ...after].join('\n')
  }

  // Sub-field replacement inside a block-mapping item. Item lines look like:
  //   - sub1: val1
  //     sub2: val2
  // We replace the line containing `sub:` (with the same indent as the rest
  // of the mapping). The first line of the item starts with the `-` marker.
  const subFieldRe = new RegExp(`^(\\s+)(${subField.replace(/[-]/g, '\\-')}):\\s*.*$`)
  // The `- ` first line could itself carry the first sub-field
  // (`  - sub1: val1`); handle that case too.
  const firstLineMatch = (lines[itemStart] ?? '').match(/^(\s+-\s+)([A-Za-z_][\w-]*):\s*.*$/)
  const newLines = lines.slice()
  let replaced = false
  if (firstLineMatch && firstLineMatch[2] === subField) {
    newLines[itemStart] = `${firstLineMatch[1]}${subField}: ${value}`
    replaced = true
  } else {
    for (let i = itemStart + 1; i < itemEnd; i++) {
      const m = (lines[i] ?? '').match(subFieldRe)
      if (m) {
        newLines[i] = `${m[1]}${subField}: ${value}`
        replaced = true
        break
      }
    }
  }
  if (!replaced) {
    // Sub-field missing — append it to the end of the item with the same
    // indent the rest of the mapping uses (fall back to listIndent + '  ').
    let mappingIndent = ''
    for (let i = itemStart + 1; i < itemEnd; i++) {
      const m = (lines[i] ?? '').match(/^(\s+)\S/)
      if (m) { mappingIndent = m[1] ?? ''; break }
    }
    if (!mappingIndent) mappingIndent = listIndent + '  '
    const insertAt = itemEnd
    const before = newLines.slice(0, insertAt)
    const after = newLines.slice(insertAt)
    return [...before, `${mappingIndent}${subField}: ${value}`, ...after].join('\n')
  }
  return newLines.join('\n')
}
