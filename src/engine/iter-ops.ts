// Iteration directives — @foreach and @set.
//
// @foreach runs the source expression once, splits the result into items,
// and re-walks the body once per item with the iteration variable bound in
// ctx.envFiles. Items are split on newlines (matching how @list / @read /
// @query return data) and on commas (matching how @read-frontmatter returns
// list-typed fields).
//
// @set evaluates an expression on the right of `=` and stores the result in
// ctx.envFiles[varName]. The RHS can be a literal, a `{{ interpolation }}`,
// or a directive call (in which case the result is the directive's output).

import type { ASTNode, ForeachNode, SetNode, InterpolationSpan, ShellInlineSpan } from 'livestage/parser'
import { parse as parserParse, scanInterpolations } from 'livestage/parser'
import type { EngineContext } from './context.js'
import { substituteParams } from './macros.js'
import { evalExpressionTyped } from './conditions.js'
import { applySort, applyWhere, applyLimit } from './render-data.js'

type WalkFn = (nodes: ASTNode[], ctx: EngineContext) => string[]
type ResolveInterpFn = (text: string, spans: InterpolationSpan[], ctx: EngineContext, shellInlines?: ShellInlineSpan[]) => string

let _walk: WalkFn | null = null
let _resolveInterp: ResolveInterpFn | null = null

/** Engine injects its own walkNodes + interpolation evaluator at module init. */
export function setIterEngine(walk: WalkFn, resolveInterp: ResolveInterpFn): void {
  _walk = walk
  _resolveInterp = resolveInterp
}

function splitItems(raw: string): string[] {
  const trimmed = (raw ?? '').trim()
  if (trimmed === '') return []
  // JSON array shape FIRST — `[a, b, c]` or pretty-printed
  // `[\n  "a",\n  "b"\n]`. The interpolation sandbox JSON.stringify's arrays
  // with indent=2 so they reach here with newlines; without this branch
  // running first, the newline-split below treats `[`, `"a",`, `]` as
  // separate items. Try real JSON.parse before the fallback bracket-strip
  // so quoted strings round-trip cleanly even when they contain commas.
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map(v => String(v)).filter(s => s !== '')
    } catch { /* fall through to manual bracket strip */ }
    return trimmed
      .slice(1, -1)
      .split(',')
      .map(s => s.trim().replace(/^["']|["']$/g, ''))
      .filter(s => s !== '')
  }
  // Newline-separated (the natural output of @list, @read, @query).
  if (trimmed.includes('\n')) {
    return trimmed.split('\n').map(s => s.trim()).filter(s => s !== '')
  }
  // Comma-separated list (e.g. @read-frontmatter list field).
  if (trimmed.includes(',')) {
    return trimmed.split(',').map(s => s.trim()).filter(s => s !== '')
  }
  // Single scalar — treat as one-item list.
  return [trimmed]
}

export function evaluateSource(literal: string, ctx: EngineContext): string {
  if (!_walk || !_resolveInterp) return ''
  const trimmed = literal.trim()
  if (trimmed === '') return ''
  // If the literal starts with `@`, parse and execute it as a sub-directive.
  if (trimmed.startsWith('@')) {
    // v2 inline directives need a trailing ` /` self-close. The literal here
    // is a single-line directive expression (e.g. `@list ./docs/ match="*.md"`)
    // — add ` /` if not already present.
    const needsSlash = !/\s\/\s*$/.test(trimmed)
    const dir = needsSlash ? `${trimmed} /` : trimmed
    const ast = parserParse(`${dir}\n`)
    const bodyNodes = ast.nodes.filter(n => n.type !== 'markdown' && n.type !== 'passthrough')
    if (bodyNodes.length === 0) return ''
    return _walk(bodyNodes, ctx).join('\n').trim()
  }
  // Otherwise treat as text with `{{ }}` interpolation support.
  const spans = scanInterpolations(trimmed)
  return _resolveInterp(trimmed, spans, ctx, [])
}

const SINGLE_INTERP_RE = /^\{\{\s*([\s\S]*?)\s*\}\}$/

// foreach.ts's parser captures EVERYTHING after "<var> in " into
// literalSource, including any trailing where=/sort=/limit= attribute
// clause on the same opener line (those are ALSO tokenized separately
// into node.args, this is just literalSource's own copy still carrying
// them as trailing text). Strip a run of them from the end before
// resolving the source expression, so `{{ rows }} where="..."` is still
// recognized as a clean single-interpolation source rather than falling
// through to the legacy text path with `where="..."` as unparseable
// trailing garbage. Quote-aware (a `\"` inside the value doesn't end the
// match early); repeats to handle more than one trailing attr in any order.
const TRAILING_FOREACH_ATTR_RE = /\s+(?:where|sort|limit)="(?:[^"\\]|\\.)*"\s*$/
function stripTrailingForeachAttrs(literal: string): string {
  let out = literal
  for (let guard = 0; guard < 10; guard++) {
    const next = out.replace(TRAILING_FOREACH_ATTR_RE, '')
    if (next === out) break
    out = next
  }
  return out
}

// Resolves the foreach source into real items, preserving structure when
// possible instead of always going through the string round-trip. Three
// shapes, matched in order:
//   - "@directive ..." (unchanged): parses and executes it, always yields
//     string lines, the same as before.
//   - a single "{{ expr }}" spanning the whole literal (the same fast-path
//     shape executeSet's typed binding already uses): evaluated with
//     evalExpressionTyped so an array of objects stays an array of
//     objects, not a stringify-then-reparse round trip. A non-array
//     result falls back to the legacy text-splitting behavior on its
//     string form, so `{{ today }}` and similar scalar bindings are
//     unaffected.
//   - anything else (mixed text, a literal comma list, multiple {{ }}
//     spans): the legacy evaluateSource + splitItems text path, unchanged.
function resolveForeachItems(literal: string, ctx: EngineContext): unknown[] {
  const rawTrimmed = literal.trim()
  if (rawTrimmed === '') return []
  // Checked BEFORE stripTrailingForeachAttrs, and passed through
  // untouched: an embedded directive call owns every attribute on its own
  // line, including one that happens to be spelled where=/sort=/limit=
  // and happens to be the LAST attribute, which stripping would otherwise
  // corrupt (see the executeForeach-level comment on why sort=/where=/
  // limit= never apply to this form at all).
  if (rawTrimmed.startsWith('@')) {
    return splitItems(evaluateSource(rawTrimmed, ctx))
  }
  const trimmed = stripTrailingForeachAttrs(rawTrimmed)
  if (trimmed === '') return []
  const singleMatch = trimmed.match(SINGLE_INTERP_RE)
  if (singleMatch) {
    const typed = evalExpressionTyped(singleMatch[1]!.trim(), ctx)
    if (Array.isArray(typed)) return typed
    if (typed === undefined || typed === null) return []
    if (typeof typed === 'object') return [typed]
    return splitItems(String(typed))
  }
  return splitItems(evaluateSource(trimmed, ctx))
}

function itemToStringForm(item: unknown): string {
  if (item === null || item === undefined) return ''
  if (typeof item === 'object') return JSON.stringify(item)
  return String(item)
}

export function executeForeach(node: ForeachNode, ctx: EngineContext): string {
  if (!_walk) return ''
  if (!node.varName) {
    ctx.warnings.push('@foreach: missing iteration variable name')
    return ''
  }
  const sourceLiteral = node.literalSource ?? ''
  let items = resolveForeachItems(sourceLiteral, ctx)
  // sort=/where=/limit= apply only to the bound-value form (`{{ expr }}`,
  // a literal list, ...), never when the source is an embedded directive
  // call (`@list ... where="..." fields="..."`). node.args is populated
  // by the same generic opener-line tokenizer regardless of WHERE an
  // attribute-shaped token appears, so an embedded `@list ... where=`
  // clause and a genuine @foreach-level where= land in the exact same
  // node.args bag; found live, README.stage's own
  // `@foreach docid in @list ".mdd/docs/*.md" where="primitives.length >
  // 0" fields="id"` silently emptied every iteration, since the query's
  // OWN where= got reapplied against each plain-string doc id (no
  // `primitives` field on a bare string, the filter's expression threw
  // for every item, whereMatches treats a throw as "does not match").
  // Every where=/sort=/limit= example in the spec this shipped against
  // uses the bound-value form exclusively, never the embedded-call form,
  // so scoping it this way loses nothing the feature actually promised.
  if (!sourceLiteral.trim().startsWith('@')) {
    items = applySort(items, node.args['sort'])
    items = applyWhere(items, node.args['where'])
    items = applyLimit(items, node.args['limit'])
  }
  if (items.length === 0) return ''

  const previousEnv = ctx.envFiles[node.varName]
  const previousData = ctx.data[node.varName]
  const parts: string[] = []
  for (const item of items) {
    const stringForm = itemToStringForm(item)
    ctx.envFiles[node.varName] = stringForm
    // Structured items also get a ctx.data binding so `{{ item.field }}`
    // resolves via the normal dotted-path expression sandbox (the same
    // one every other directive's {{ }} already reads ctx.data through);
    // substituteParams below only ever touches a LITERAL `{{ varName }}`
    // (no dots) in markdown/attrs, so a dotted reference is untouched by
    // it and reaches this binding at render time instead.
    if (item !== null && typeof item === 'object') ctx.data[node.varName] = item
    else delete ctx.data[node.varName]
    // Substitute {{ varName }} into the body's directive args as well as
    // markdown text. Without this pass, a body node like
    // `@read-frontmatter path="{{ doc }}"` would carry `{{ doc }}` literally
    // into execution. With substitution, each iteration sees a fresh copy
    // of the body with the current item interpolated everywhere. The
    // string form (JSON for an object item) is what a bare `{{ item }}`
    // (no field) splices to, same convention as ctx.envFiles above.
    const subbed = substituteParams(node.body, { [node.varName]: stringForm })
    const bodyOut = _walk(subbed, ctx).join('\n')
    parts.push(bodyOut)
  }
  // Restore (or delete) the previous binding so nesting / sibling foreach work.
  if (previousEnv === undefined) delete ctx.envFiles[node.varName]
  else ctx.envFiles[node.varName] = previousEnv
  if (previousData === undefined) delete ctx.data[node.varName]
  else ctx.data[node.varName] = previousData
  return parts.join('\n')
}

export function executeSet(node: SetNode, ctx: EngineContext): string {
  if (!node.varName) {
    ctx.warnings.push('@set: missing variable name')
    return ''
  }
  const literal = (node.literalExpr ?? '').trim()
  // Fast path: literal is a single `{{ expr }}` with nothing else around it.
  // Evaluate the expression with type preserved (boolean / number / object
  // stay typed) and store under ctx.data so @if/@switch downstream see the
  // real type. Without this, `@set t = {{ false }}` stored "false" as a
  // string, and `@if {{ t }}` then took the truthy branch (non-empty string).
  const singleInterp = literal.match(/^\{\{\s*([\s\S]*?)\s*\}\}$/)
  if (singleInterp) {
    const typed = evalExpressionTyped(singleInterp[1]!.trim(), ctx)
    if (typed !== undefined && typed !== null) {
      ctx.data[node.varName] = typed
      // Stringified fallback for callers that read via ctx.envFiles
      // (interpolation in text contexts, legacy code paths).
      ctx.envFiles[node.varName] = typeof typed === 'object'
        ? JSON.stringify(typed)
        : String(typed)
    } else {
      ctx.envFiles[node.varName] = ''
    }
    return ''
  }
  // Mixed text+interpolation or @directive RHS: fall back to string eval.
  let value = evaluateSource(literal, ctx)
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    value = value.slice(1, -1)
  }
  ctx.envFiles[node.varName] = value
  return ''
}
