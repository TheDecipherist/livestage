import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import type {
  ASTNode, ParseResult, CallNode, ConditionalNode, SwitchNode, PipeNode,
} from 'livestage/parser'
import { scanInterpolations } from 'livestage/parser'
import { render } from 'livestage/renderer'
import type { RenderType, RendererInput } from 'livestage/renderer'
import { makeContext, resolveEnv, type EngineContext } from './context.js'
import { substituteParams } from './macros.js'
import { evalCondition, evalExpression } from './conditions.js'
import { runBuiltin } from './pipe.js'
import { runShell } from './shell.js'
import { executeList, executeRead, executeCount, executeDate, executeTree, executeQuery } from './sources.js'
import { executeUpdateFrontmatter } from './write-ops.js'
import { executeReadFrontmatter, executeHash } from './read-ops.js'
import { executeTest, executeCheck } from './exec-ops.js'
import { executeForeach, executeSet, setIterEngine } from './iter-ops.js'
import { resolveInterpolations } from './engine-interpolate.js'
import { FatalError, versionIsNewer, loadStdlib, executeImport, executeInclude } from './engine-include.js'
import { executeTemplate, executeData } from './engine-template.js'
import { evaluateAssert } from './assert/operators.js'
import { formatAssertResult } from './assert/results.js'
import { executeCode } from './code-runners.js'
import { executeGraph } from './graph.js'
import { buildDeterminism } from './determinism.js'
import { parseTraceConfig } from './trace/config.js'
import { emitRecord } from './trace/emit.js'
import { extractArgs } from './trace/span.js'
import { applyMasking } from './security/masking.js'
import { expandPatterns } from './security/path-expand.js'
import { buildExpandContext } from './expand-context.js'

export type { EngineContext }
export { FatalError }

const LIVESTAGE_VERSION = '1.0'

export interface EngineOptions {
  ctx?: Partial<EngineContext>
  filePath?: string
  passthrough?: boolean
  // --deterministic CLI flag: same effect as LIVESTAGE_DETERMINISTIC=1 in
  // the environment, without requiring the caller to touch process.env.
  deterministic?: boolean
}

export interface EngineResult {
  output: string
  errors: string[]
  warnings: string[]
  events: import('./context.js').EngineEvent[]
  /** The @on complete transition that fired during execution, if any. */
  chosenTransition: import('./context.js').ChosenTransition | null
  /**
   * Final ctx.data (struct values from @set with single-{{ }} RHS) at end of
   * execution. Exposed so the MCP can persist this into a session and
   * restore it on the next resolve_phase call, giving cross-phase closure
   * semantics over the MCP boundary.
   */
  data: Record<string, unknown>
  /**
   * Final ctx.envFiles (string values from @set) at end of execution.
   * Same session-persistence role as `data`.
   */
  envFiles: Record<string, string>
}

function resolveGitMeta(cwd: string): { hash: string; short: string } | null {
  try {
    const result = spawnSync('git', ['log', '-1', '--format=%H %h'], { cwd, encoding: 'utf8', timeout: 2000 })
    if (result.status !== 0 || !result.stdout?.trim()) return null
    const parts = result.stdout.trim().split(' ')
    const hash = parts[0] ?? ''
    const short = parts[1] ?? hash.slice(0, 7)
    return hash ? { hash, short } : null
  } catch {
    return null
  }
}

/**
 * Resolve sourceJail and dataJail on the EngineContext.
 *
 * Source ops (@import / @include) jail to source_root. Data ops (@list / @read /
 * @tree / @count / file.*) jail to data_root. Both can be configured in
 * security.json's filesystem section:
 *
 *   source_root: "auto" | "cwd" | <absolute path>   (default: "auto")
 *   data_root:   "auto" | "cwd" | <absolute path>   (default: "cwd")
 *
 *   "auto" → dirname(mainFile) (the document directory)
 *   "cwd"  → process.cwd()
 *
 * Explicit values on ctx.security.sourceJail / dataJail (set by the caller,
 * e.g. MCP read_file) take precedence over filesystem config.
 *
 * Falls back to ctx.security.jailRoot when neither config nor caller set the
 * v2.0 fields — keeps legacy code paths working.
 */
function resolveJailRoots(ctx: EngineContext, mainFile: string | null): void {
  const fsConfig = ctx.security.filesystemConfig
  const docDir = mainFile ? dirname(mainFile) : ctx.docDir
  const cwd = ctx.cwd

  // Resolve a root spec: "auto" → docDir, "cwd" → process cwd, abs path → as-is.
  // The default argument is used when the config field is absent (per-op default).
  const resolveRoot = (raw: string | undefined, defaultMode: 'auto' | 'cwd'): string => {
    const mode = raw ?? defaultMode
    if (mode === 'auto') return docDir
    if (mode === 'cwd') return cwd
    return resolve(mode)
  }

  // sourceJail: explicit override > config (default "auto" = docDir)
  if (ctx.security.sourceJail === undefined || ctx.security.sourceJail === null) {
    ctx.security.sourceJail = resolveRoot(fsConfig?.source_root, 'auto')
  }

  // dataJail: explicit override > config (default "cwd" = process cwd)
  // v2.0: cwd is the canonical default. Callers wanting v1.x behavior set
  // filesystem.data_root to "auto" or assign dataJail explicitly.
  if (ctx.security.dataJail === undefined || ctx.security.dataJail === null) {
    ctx.security.dataJail = resolveRoot(fsConfig?.data_root, 'cwd')
  }

  // Allow-lists: pre-expand ${VAR} placeholders so check-time stays cheap.
  if (ctx.security.allowedSourcePaths === undefined) {
    ctx.security.allowedSourcePaths = expandAllowList(fsConfig?.allowed_source_paths, ctx)
  }
  if (ctx.security.allowedDataPaths === undefined) {
    ctx.security.allowedDataPaths = expandAllowList(fsConfig?.allowed_data_paths, ctx)
  }

  // Write jail: only resolved if writes are enabled in config. The directives
  // themselves (@mkdir / @copy / @append-if-missing) check writeEnabled and
  // refuse if false.
  if (ctx.security.writeEnabled === undefined) {
    ctx.security.writeEnabled = fsConfig?.write_enabled ?? false
  }
  if (ctx.security.writeJail === undefined || ctx.security.writeJail === null) {
    if (ctx.security.writeEnabled) {
      ctx.security.writeJail = resolveRoot(fsConfig?.write_root, 'cwd')
    } else {
      ctx.security.writeJail = null
    }
  }
  if (ctx.security.allowedWritePaths === undefined) {
    ctx.security.allowedWritePaths = expandAllowList(fsConfig?.allowed_write_paths, ctx)
  }
}

function expandAllowList(raw: string[] | undefined, ctx: EngineContext): string[] {
  if (!raw || raw.length === 0) return []
  return expandPatterns(raw, buildExpandContext(ctx))
}

export function execute(ast: ParseResult, options?: EngineOptions): EngineResult {
  if (!ast.isLiveStage && !options?.passthrough) {
    return { output: '', errors: ['Not a LiveStage document'], warnings: [], events: [], chosenTransition: null, data: {}, envFiles: {} }
  }
  const base = makeContext(options?.ctx)
  if (!base.runId) base.runId = crypto.randomUUID()
  if (!base.gitMeta) base.gitMeta = resolveGitMeta(base.cwd)
  // Distinct from `!base.traceConfig`: a caller can explicitly pass
  // `ctx: { traceConfig: null }` to force tracing off, which must not be
  // clobbered by the env-var-derived default (tracing is on by default, so
  // "unset" and "explicitly disabled" are both `null` post-merge and have
  // to be told apart before the merge).
  if (options?.ctx?.traceConfig === undefined) {
    base.traceConfig = parseTraceConfig(process.env['LIVESTAGE_TRACE'], base.cwd)
  }
  if (options?.ctx?.determinism === undefined) {
    base.determinism = buildDeterminism(base.env, options?.deterministic)
  }
  loadStdlib(base)
  const mainFile = options?.filePath ? resolve(options.filePath) : null
  if (mainFile) {
    base.docDir = dirname(mainFile)
    base.resolutionStack.add(mainFile)
    if (base.security.jailRoot === null) {
      base.security = { ...base.security, jailRoot: dirname(mainFile) }
    }
  }
  // v2.0: resolve source and data jails from filesystem config (if not already
  // set by the caller). source defaults to dirname(mainFile); data defaults to
  // process cwd. Both can be overridden via filesystem.{source,data}_root.
  resolveJailRoots(base, mainFile)
  const errors: string[] = []
  const parts: string[] = []
  const renderStartedAt = Date.now()
  let directiveCount = 0

  if (ast.version && versionIsNewer(ast.version, LIVESTAGE_VERSION)) {
    base.warnings.push(`Document requires livestage v${ast.version} but installed version is v${LIVESTAGE_VERSION}`)
  }

  for (const node of ast.nodes) {
    // The leading legacy format-marker line (parser.ts) is an inert,
    // empty-raw passthrough, not an executed directive; every other
    // non-markdown node, including a genuinely unknown directive attempt,
    // counts.
    const isInertMarker = node.type === 'passthrough' && node.raw === ''
    if (node.type !== 'markdown' && !isInertMarker) directiveCount++
    try {
      const out = walkNode(node, base)
      if (out !== '' || (node.type === 'markdown' && node.text.trim() === '')) parts.push(out)
    } catch (err) {
      errors.push(String(err))
    }
  }
  if (mainFile) {
    base.resolutionStack.delete(mainFile)
    base.completedSet.add(mainFile)
  }
  const joined = parts.join('\n').trimStart()
  const output = base.consumer === 'ai' ? injectAiPrefixes(joined, base) : joined
  if (base.traceConfig) {
    emitRecord({
      t: 'render',
      render_id: base.runId,
      doc: base.docDir,
      ms: Date.now() - renderStartedAt,
      directives: directiveCount,
      degraded: false,
      exit: errors.length > 0 ? 1 : 0,
    }, base.traceConfig)
  }
  return { output, errors, warnings: base.warnings, events: base.events, chosenTransition: base.chosenTransition, data: base.data, envFiles: base.envFiles }
}

setIterEngine(walkNodes, resolveInterpolations)

function injectAiPrefixes(body: string, ctx: EngineContext): string {
  const prefixes: string[] = []
  if (ctx.glossary.size > 0) {
    const rows = [...ctx.glossary.entries()].map(([k, v]) => `**${k}** — ${v}`).join('\n')
    prefixes.push(`## Glossary\n\n${rows}\n\n---`)
  }
  if (ctx.constraints.length > 0) {
    const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
    const sorted = [...ctx.constraints].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4))
    const rows = sorted.map(c => `| ${c.id} | ${c.severity.toUpperCase()} | ${c.body.replace(/\n/g, ' ')} |`).join('\n')
    prefixes.push(`## Constraints\n\n| ID | Severity | Rule |\n|----|----------|------|\n${rows}\n\n---`)
  }
  return prefixes.length > 0 ? prefixes.join('\n\n') + '\n\n' + body : body
}

function walkNodes(nodes: ASTNode[], ctx: EngineContext): string[] {
  const parts: string[] = []
  for (const node of nodes) {
    try {
      const out = walkNode(node, ctx)
      if (out !== '' || (node.type === 'markdown' && node.text.trim() === '')) parts.push(out)
    } catch (err) {
      if (err instanceof FatalError) throw err
      ctx.warnings.push(String(err))
    }
  }
  return parts
}

function walkNodeCore(node: ASTNode, ctx: EngineContext): string {
  switch (node.type) {
    // A leading legacy format-marker line (no header directive exists) parses
    // as an inert passthrough node with an empty raw (see parser.ts): it
    // contributes nothing to output, same as the retired header node used to.
    case 'passthrough': return node.raw
    case 'graph': return executeGraph(node, ctx)
    case 'markdown': return resolveInterpolations(node.text, node.interpolations, ctx, node.shellInlines)
    case 'env': return resolveEnv(node.name, node.fallback, ctx)
    case 'define': { ctx.macros[node.name] = { body: node.body, params: node.params }; return '' }
    case 'call': return handleCall(node, ctx)
    case 'conditional': return handleConditional(node, ctx)
    case 'switch': return handleSwitch(node, ctx)
    case 'pipe': return executePipe(node, ctx)
    case 'include': return executeInclude(node, ctx, walkNodes)
    case 'template': return executeTemplate(node, ctx, walkNodes)
    case 'data': return executeData(node, ctx)
    case 'import': { executeImport(node, ctx); return '' }
    case 'list':
    case 'read':
    case 'tree':
    case 'count':
    case 'date':
    case 'query': {
      const lines = executeSource(node, ctx)
      const sourceArgs = 'args' in node ? (node as { args: Record<string, string> }).args : undefined
      const label = sourceArgs?.['label']
      if (label && typeof label === 'string') {
        // For single-line scalar-shaped directives (count, date), the value
        // is the first (and only) line. For multi-line sources (read, list,
        // tree, query) keep the full content joined so labels can carry the
        // whole output for substring tests, foreach sources, etc.
        const scalarShaped = node.type === 'count' || node.type === 'date'
        ctx.envFiles[label] = scalarShaped
          ? (lines[0]?.trim() ?? '')
          : lines.join('\n').trim()
      }
      // visible="false" or silent="true" suppresses inline output (useful
      // when label= captures the data and inline rendering would just dump
      // a long file listing into the phase output).
      const visible = sourceArgs?.['visible']
      const silent = sourceArgs?.['silent']
      if (visible === 'false' || silent === 'true') return ''
      return lines.join('\n')
    }
    case 'update-frontmatter': return executeUpdateFrontmatter(node, ctx)
    case 'read-frontmatter': return executeReadFrontmatter(node, ctx)
    case 'test': return executeTest(node, ctx)
    case 'check': return executeCheck(node, ctx)
    case 'hash': return executeHash(node, ctx)
    case 'foreach': return executeForeach(node, ctx)
    case 'set': return executeSet(node, ctx)
    case 'assert': {
      const result = evaluateAssert(node, ctx)
      ctx.assertResults?.push(result)
      return formatAssertResult(result)
    }
    case 'code': {
      const stdout = executeCode(node, ctx)
      // visible="false" or silent="true" suppresses inline output, same
      // convention as @list/@read/@query/etc: label= already captured the
      // structured result, so the raw stdout dump would just duplicate it
      // in the rendered output (found live building the http-health
      // example, feature 47, where {{ label.field }} prose repeated the
      // same JSON @code had already printed inline).
      const visible = node.args['visible']
      const silent = node.args['silent']
      if (visible === 'false' || silent === 'true') return ''
      return stdout
    }
    default: throw new Error(`walkNode: unhandled AST node type "${(node as { type: string }).type}"`)
  }
}

function walkNode(node: ASTNode, ctx: EngineContext): string {
  if (!ctx.traceConfig) return walkNodeCore(node, ctx)

  const id = crypto.randomUUID()
  const startedAt = Date.now()
  const nodeRecord = node as unknown as Record<string, unknown>
  const rawArgs = extractArgs(nodeRecord)
  const maskedArgs: Record<string, string> = {}
  for (const [k, v] of Object.entries(rawArgs)) {
    maskedArgs[k] = applyMasking(v).masked
  }
  const isStructural = node.type === 'markdown'
  const base = {
    t: 'directive' as const,
    id,
    runId: ctx.runId,
    ast: isStructural ? node.type as 'markdown' : 'directive' as const,
    ...(isStructural ? {} : { directive: node.type }),
    document: ctx.docDir,
    line: (nodeRecord['line'] as number | undefined) ?? 0,
    phase: ctx.phase,
    callstack: [...ctx.callstack],
    args: maskedArgs,
    git: ctx.gitMeta,
    sessionId: ctx.mcp?.sessionId ?? null,
  }

  emitRecord({ ...base, status: 'start', timestamp: startedAt, startedAt }, ctx.traceConfig)

  try {
    const output = walkNodeCore(node, ctx)
    const endedAt = Date.now()
    emitRecord({ ...base, status: 'end', timestamp: endedAt, startedAt, endedAt, duration: endedAt - startedAt, outputSize: Buffer.byteLength(output) }, ctx.traceConfig)
    return output
  } catch (err) {
    const endedAt = Date.now()
    emitRecord({ ...base, status: 'error', timestamp: endedAt, startedAt, endedAt, duration: endedAt - startedAt, error: String(err) }, ctx.traceConfig)
    throw err
  }
}

function handleCall(node: CallNode, ctx: EngineContext): string {
  // Evaluate interpolations in the macro name so dynamic calls like
  // @call prefix-{{ entry }} / resolve to the actual macro name at runtime.
  const macroName = node.name.includes('{{')
    ? resolveInterpolations(node.name, scanInterpolations(node.name), ctx, [])
    : node.name
  const macro = ctx.macros[macroName]
  if (!macro) return ''
  const namedArgs: Record<string, string> = { ...node.args }
  for (let i = 0; i < node.positionalArgs.length; i++) {
    const paramName = macro.params[i]
    if (paramName !== undefined) namedArgs[paramName] = node.positionalArgs[i] ?? ''
  }
  ctx.callstack.push(`call:${macroName}`)
  try {
    return walkNodes(substituteParams(macro.body, namedArgs), ctx).join('\n').trimStart()
  } finally {
    ctx.callstack.pop()
  }
}

function handleConditional(node: ConditionalNode, ctx: EngineContext): string {
  for (const branch of node.branches) {
    if (branch.condition === null || evalCondition(branch.condition, ctx)) return walkNodes(branch.body, ctx).join('\n').trimStart()
  }
  return ''
}

const SWITCH_INTERP_RE = /\{\{\s*([\s\S]*?)\s*\}\}/g

function evalSwitchValue(expr: string, ctx: EngineContext): string {
  const expanded = expr.replace(SWITCH_INTERP_RE, (_, inner: string) => {
    return JSON.stringify(evalExpression(inner.trim(), ctx))
  })
  return evalExpression(expanded, ctx)
}

function handleSwitch(node: SwitchNode, ctx: EngineContext): string {
  const switchVal = evalSwitchValue(node.expression, ctx)
  for (const c of node.cases) {
    if (evalSwitchValue(c.caseExpression, ctx) === switchVal) {
      return walkNodes(c.body, ctx).join('\n').trimStart()
    }
  }
  if (node.defaultBody !== null) return walkNodes(node.defaultBody, ctx).join('\n').trimStart()
  return ''
}

function executePipe(node: PipeNode, ctx: EngineContext): string {
  let lines: string[] = []
  // Source-stage args that affect labeling/visibility need to be honored
  // even though the parser auto-wraps `@db ... as=row label=x visible=false`
  // into a pipe — the label binding and visibility suppression apply to the
  // SOURCE, not the rendered sink output. The parser moves `as=` from the
  // source onto the sink, so we read the render type from the sink.
  let sourceArgs: Record<string, string> | undefined
  for (const stage of node.stages) {
    switch (stage.type) {
      case 'source': {
        if ('args' in stage.node) sourceArgs = (stage.node as { args: Record<string, string> }).args
        lines = executeSource(stage.node, ctx)
        const label = sourceArgs?.['label']
        if (label && typeof label === 'string') {
          ctx.envFiles[label] = lines.join('\n').trim()
        }
        break
      }
      case 'builtin': lines = runBuiltin(stage.command, lines); break
      case 'shell': {
        // grep/sort/head/tail/uniq/wc are cross-platform Node built-ins
        // (the 'builtin' case above) and never reach here. Any other
        // utility named in a pipe stage falls through to the shell
        // allowlist, which does not translate to Windows (different shell,
        // different command set); stripped with a WARN there instead of
        // spawning a command that would behave unpredictably.
        if (process.platform === 'win32') {
          ctx.warnings.push(`WARN: pipe stage "${stage.command}" stripped: non-built-in shell utilities are not supported on Windows`)
          lines = []
          break
        }
        lines = runShell(stage.command, lines, ctx)
        break
      }
      case 'sink': {
        // visible=false / silent=true on the SOURCE suppresses the sink's
        // rendered output — caller wants the data captured into a label,
        // not dumped inline.
        const visible = sourceArgs?.['visible']
        const silent = sourceArgs?.['silent']
        if (visible === 'false' || silent === 'true') return ''
        const { type: t, columns: cols, ...rest } = stage.node.args
        const input: RendererInput = { type: (t ?? 'list') as RenderType, data: lines }
        if (cols) input.columns = cols.split(',').map((c: string) => c.trim())
        if (Object.keys(rest).length > 0) input.options = rest
        return render(input)
      }
      case 'scalar': return lines.join(' ')
      default: throw new Error(`executePipe: unhandled stage type "${(stage as { type: string }).type}"`)
    }
  }
  return render({ type: 'list', data: lines })
}

function executeSource(node: ASTNode, ctx: EngineContext): string[] {
  switch (node.type) {
    case 'env': { const val = resolveEnv(node.name, node.fallback, ctx); return val === '' ? [] : val.split('\n') }
    case 'list': return executeList(node, ctx)
    case 'read': return executeRead(node, ctx)
    case 'tree': return executeTree(node, ctx)
    case 'count': return executeCount(node, ctx)
    case 'date': return executeDate(node, ctx)
    case 'query': return executeQuery(node, ctx)
    case 'call': {
      // @call as a pipe source: invoke the macro and treat its rendered
      // output as the pipe input. Macros that return multi-line text
      // become a line-array; single-line scalars become a single-element
      // array. Empty output yields an empty array (no rows).
      const out = handleCall(node as CallNode, ctx)
      if (out === '') return []
      return out.split('\n')
    }
    case 'read-frontmatter': {
      // Field read returns a scalar; emit as a single line.
      const out = executeReadFrontmatter(node as import('livestage/parser').ReadFrontmatterNode, ctx)
      return out === '' ? [] : out.split('\n')
    }
    case 'hash': {
      const out = executeHash(node as import('livestage/parser').HashNode, ctx)
      return out === '' ? [] : [out]
    }
    case 'code': {
      // Piped like @query: the script's own stdout, split into lines. A
      // script that wants tabular @render output prints tab-separated rows
      // itself, the same convention @query already assumes. Drop a single
      // trailing empty line (console.log/print's own trailing newline),
      // not an intentional blank row.
      const out = executeCode(node as import('livestage/parser').CodeNode, ctx)
      if (out === '') return []
      const lines = out.split('\n')
      if (lines[lines.length - 1] === '') lines.pop()
      return lines
    }
    default: throw new Error(`"@${node.type}" cannot be used as a pipe source`)
  }
}
