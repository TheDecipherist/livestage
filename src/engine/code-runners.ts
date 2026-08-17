import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanInterpolations } from 'livestage/parser'
import type { CodeNode } from 'livestage/parser'
import type { EngineContext } from './context.js'
import { resolveDataPath } from './sources.js'
import { resolveGlobTargets } from './sources-file-utils.js'
import { resolveInterpolations } from './engine-interpolate.js'
import { buildLiveStageContextJson } from './args.js'
import { cacheKey, readCache, writeCache } from './cache.js'
import { parseCodeOutput, parseCoerceSpec, isParseFormat } from './parse-formats.js'
import type { SchemaField } from './schema/loader.js'
import { validateFieldValue } from './schema/validate.js'
import { hashFileSet } from './content-hash.js'

// language -> runner command. Extended/overridden by policy's code.runners.
const DEFAULT_RUNNERS: Record<string, string> = {
  javascript: 'node',
  python: 'python3',
  bash: 'bash',
}

const SCRIPT_EXT: Record<string, string> = {
  javascript: '.js',
  python: '.py',
  bash: '.sh',
  ruby: '.rb',
}

export interface CodeResult {
  _exit: number
  _stdout: string
  _stderr: string
  _duration: number
}

// Decides what ctx.data[label] becomes from a script's raw stdout. Shared
// by the live-run and mock paths so parse=/no-parse= behave identically
// either way. `parseBranch` is bound alongside the value (see executeCode)
// as the durable record of which path was taken, since a runtime decision
// like "auto-detect saw a JSON object" isn't otherwise visible anywhere
// after the fact.
function bindStructuredOutput(base: CodeResult, stdout: string, node: CodeNode): { value: unknown; parseBranch: string } {
  const parseSpec = node.args['parse']
  if (parseSpec) {
    if (!isParseFormat(parseSpec)) {
      throw new Error(`@code: parse="${parseSpec}" is not a recognized format (expected one of text, json, ndjson, csv, tsv, xml, yaml, lines)`)
    }
    const coerce = parseCoerceSpec(node.args['coerce'])
    const value = parseCodeOutput(stdout, parseSpec, coerce)
    return { value, parseBranch: parseSpec }
  }
  // No parse=: today's exact auto-detect behavior, unchanged for backward
  // compatibility. Only a JSON object (not an array, not a scalar) merges
  // into the base CodeResult fields; anything else leaves the base result
  // standing alone, exactly as before this session's work.
  let structured: Record<string, unknown> = { ...base }
  let parseBranch = 'auto-text'
  try {
    const parsed: unknown = JSON.parse(stdout)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      structured = { ...base, ...(parsed as Record<string, unknown>) }
      parseBranch = 'auto-json-object'
    }
  } catch {
    // stdout is not JSON; base result stands alone.
  }
  return { value: structured, parseBranch }
}

function loadCodeSchemaFields(resolvedPath: string): Record<string, SchemaField> {
  let raw: string
  try {
    raw = readFileSync(resolvedPath, 'utf8')
  } catch (err) {
    throw new Error(`@code: schema file cannot be read (${resolvedPath}): ${String(err)}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(`@code: schema file is not valid JSON (${resolvedPath}): ${String(err)}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || typeof (parsed as Record<string, unknown>)['fields'] !== 'object') {
    throw new Error(`@code: schema file does not match the expected shape { fields: { name: { type, enum?, required? } } } (${resolvedPath})`)
  }
  return (parsed as { fields: Record<string, SchemaField> }).fields
}

// Wired to the SAME schema/loader.ts + schema/validate.ts machinery a
// document's own class-based schema uses (@update-frontmatter/
// @read-frontmatter), reused rather than reinvented. One real difference:
// schema= here is a PATH to an ad-hoc schema file (the brief's own
// example, schema="dead.schema.json"), not a class name resolved under
// .livestage/schemas/<class>.json, since a script's output shape belongs
// to the script, not to a document's frontmatter class. Validates either
// a single object's own top-level fields, or every row of an array of
// objects (the natural shape for a CSV/TSV/NDJSON parse= result); a value
// that is neither is a schema= usage error, not a silent skip, matching
// this whole feature's "fail loudly" rule.
function validateCodeSchema(value: unknown, fields: Record<string, SchemaField>, schemaArg: string): void {
  const rows: Record<string, unknown>[] = Array.isArray(value)
    ? value.filter((v): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v))
    : (value !== null && typeof value === 'object' && !Array.isArray(value))
      ? [value as Record<string, unknown>]
      : []
  const isEmptyArray = Array.isArray(value) && value.length === 0
  if (rows.length === 0 && !isEmptyArray) {
    throw new Error(`@code: schema="${schemaArg}" needs a structured object or array-of-objects result to validate, got ${value === null ? 'null' : typeof value}`)
  }
  const fakeSchema = { class: 'code-output', fields }
  for (const row of rows) {
    for (const [field, rule] of Object.entries(fields)) {
      const raw = row[field]
      if (raw === undefined) {
        if (rule.required) throw new Error(`@code: schema="${schemaArg}" validation failed, field "${field}" is required but missing`)
        continue
      }
      const asString = typeof raw === 'string' ? raw : JSON.stringify(raw)
      const result = validateFieldValue(fakeSchema, field, asString)
      if (!result.valid) throw new Error(`@code: schema="${schemaArg}" ${result.error}`)
    }
  }
}

// Part 5: cache on the CONTENT of the files a script actually depends on,
// not just on the script's own args. cache-key="./src/**/*.ts" hashes the
// matched file set (paths and contents, sorted so file-system iteration
// order never changes the hash); folded into the persist/session cache
// key, so any change to any matched file is a cache miss, and no change
// is a cache hit regardless of how much wall-clock time passed. A blocked
// or empty glob degrades to no effect (resolveDataPath already pushed its
// own SECURITY_ALERT warning), same convention as every other path-jailed
// directive in this codebase.
function computeCacheKeyContentHash(glob: string, ctx: EngineContext): string | null {
  const files = resolveGlobTargets(glob, p => resolveDataPath(p, ctx, '@code cache-key'))
  if (files.length === 0) return null
  return hashFileSet(files)
}

function runMockCode(node: CodeNode, ctx: EngineContext): string | null {
  if (node.cache?.mode !== 'mock' || !node.cache.mockPath) return null
  const full = resolveDataPath(node.cache.mockPath, ctx, '@code mock')
  if (!full) return ''
  let stdout: string
  try { stdout = readFileSync(full, 'utf8') } catch { return '' }

  const base: CodeResult = { _exit: 0, _stdout: stdout, _stderr: '', _duration: 0 }
  const { value, parseBranch } = bindStructuredOutput(base, stdout, node)
  bindLabel(node, ctx, value, stdout, base, parseBranch)
  return stdout
}

interface RunResult {
  stdout: string
  base: CodeResult
}

function runLiveCode(
  node: CodeNode,
  ctx: EngineContext,
  runnerCmd: string,
  scriptSource: string,
  timeout: number,
): RunResult {
  const ext = SCRIPT_EXT[node.language] ?? ''
  const tmpDir = mkdtempSync(join(tmpdir(), 'livestage-code-'))
  const scriptPath = join(tmpDir, `script${ext}`)
  writeFileSync(scriptPath, scriptSource, 'utf8')

  const contextJson = buildLiveStageContextJson(
    {
      args: ctx.skillContext?.args ?? '',
      argsList: ctx.skillContext?.argsList ?? [],
      vars: ctx.skillContext?.vars ?? {},
    },
    ctx.docDir,
  )

  const startedAt = Date.now()
  let result: import('node:child_process').SpawnSyncReturns<string>
  try {
    // argv-array form (never a shell string): this is the always-block
    // carve-out (CR-5 business rule 5). A @query "node -e ..." still hits
    // the immutable SHELL_ALWAYS_BLOCK pattern for -e/-c because it goes
    // through checkShellCommand on a literal shell string; this path never
    // constructs one, it spawns the runner directly against a temp file
    // the engine wrote, so there is no user-typed string to check.
    result = spawnSync(runnerCmd, [scriptPath], {
      input: contextJson,
      env: { ...process.env, LIVESTAGE_CONTEXT: contextJson },
      cwd: ctx.docDir,
      timeout,
      encoding: 'utf8',
    })
  } finally {
    rmSync(tmpDir, { recursive: true, force: true })
  }

  const duration = Date.now() - startedAt
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  const exit = result.status ?? -1

  if (result.error) {
    ctx.warnings.push(`@code: failed to run "${runnerCmd}": ${result.error.message}`)
  }
  if (result.signal === 'SIGTERM') {
    ctx.warnings.push(`@code: exceeded timeout (${timeout}ms)`)
  }

  const base: CodeResult = { _exit: exit, _stdout: stdout, _stderr: stderr, _duration: duration }
  return { stdout, base }
}

function bindLabel(node: CodeNode, ctx: EngineContext, value: unknown, stdout: string, base: CodeResult, parseBranch: string): void {
  const label = node.label
  if (!label) return
  ctx.data[label] = value
  ctx.envFiles[label] = stdout
  ctx.envFiles[`${label}_exit`] = String(base._exit)
  // Durable record of which parse branch ran (the explicit format, or
  // which side of no-parse= auto-detect was taken): a runtime decision
  // that is otherwise invisible once rendering finishes, per this
  // feature's own rule that the branch taken must stay inspectable.
  ctx.envFiles[`${label}_parse`] = parseBranch
}

export function executeCode(node: CodeNode, ctx: EngineContext): string {
  // Mock cache (feature 35, determinism): serve a recorded fixture instead
  // of spawning the runner, same convention as @query's mock branch.
  const mocked = runMockCode(node, ctx)
  if (mocked !== null) return mocked

  const codeConfig = ctx.security.codeConfig
  const granted = codeConfig?.languages ?? []
  if (!granted.includes(node.language)) {
    ctx.warnings.push(`@code: language "${node.language}" is not granted (policy code.languages: [${granted.join(', ')}])`)
    return ''
  }

  const runners = { ...DEFAULT_RUNNERS, ...(codeConfig?.runners ?? {}) }
  const runnerCmd = runners[node.language]
  if (!runnerCmd) {
    ctx.warnings.push(`@code: no runner configured for language "${node.language}"`)
    return ''
  }

  let scriptSource: string
  if (node.src) {
    const full = resolveDataPath(node.src, ctx, '@code')
    if (!full || !existsSync(full)) {
      ctx.warnings.push(`@code: src not found or blocked: ${node.src}`)
      return ''
    }
    scriptSource = readFileSync(full, 'utf8')
  } else {
    scriptSource = node.body ?? ''
  }

  if (node.interpolate) {
    scriptSource = resolveInterpolations(scriptSource, scanInterpolations(scriptSource), ctx, [])
  }

  const timeout = node.timeout ?? codeConfig?.timeout ?? 30_000

  // Every grant/runner/src check above already ran live; a session/persist
  // cache hit only ever skips the actual spawn, replaying its stdout and
  // base result (including the ctx.data/envFiles label wiring below)
  // exactly as a live run would have set them, so a cached @code call is
  // indistinguishable downstream from a fresh one.
  let run: RunResult
  if (node.cache && node.cache.mode !== 'mock') {
    // cache-key= folds a content hash of the named file set into the key
    // (Part 5): unlike every other field below (the script's own identity
    // and args), file CONTENT under the glob is read fresh on every
    // render, cache hit or not, because it IS the cache-validity check.
    const cacheKeyGlob = node.args['cache-key']
    const contentHash = cacheKeyGlob ? computeCacheKeyContentHash(cacheKeyGlob, ctx) : null
    const key = cacheKey('code', { language: node.language, src: node.src, body: node.body, interpolate: node.interpolate, args: node.args, contentHash })
    const cached = readCache(key, node.cache, ctx.docDir, ctx.cwd)
    if (cached !== null) {
      run = JSON.parse(cached) as RunResult
    } else {
      run = runLiveCode(node, ctx, runnerCmd, scriptSource, timeout)
      writeCache(key, JSON.stringify(run), node.cache, ctx.security.filesystemConfig, 'code', ctx.cwd)
    }
  } else {
    run = runLiveCode(node, ctx, runnerCmd, scriptSource, timeout)
  }

  const { value, parseBranch } = bindStructuredOutput(run.base, run.stdout, node)

  // schema=: validate the bound value BEFORE binding it, so a document
  // never sees malformed data render as if it were fine (a script that
  // silently changed its output shape is exactly the drift this whole
  // engine exists to catch).
  const schemaArg = node.args['schema']
  if (schemaArg) {
    const resolved = resolveDataPath(schemaArg, ctx, '@code schema')
    if (resolved) {
      const fields = loadCodeSchemaFields(resolved)
      validateCodeSchema(value, fields, schemaArg)
    }
  }

  bindLabel(node, ctx, value, run.stdout, run.base, parseBranch)
  return run.stdout
}
