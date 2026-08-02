// The PostToolUse hook that renders `.stage` files in place of the raw Read.
//
// Named `pretooluse.ts` to match the spec's file layout, but it registers as
// a PostToolUse hook in Claude Code's settings.json: PreToolUse can only
// allow/deny/rewrite tool ARGUMENTS (`updatedInput`), it cannot substitute
// the content a Read call returns. PostToolUse can, via
// `hookSpecificOutput.updatedToolOutput.content`. This is the "hook
// substitution mechanism" decision the doc's Known Issues flagged as needing
// to be settled against the current Claude Code hook API.
//
// Fires on a pure `.stage` extension match, nothing else (CR-3, no content
// sniffing). Renders via the exact same code path as `cli render` by
// spawning the built CLI binary as a child process, which also gives a real,
// killable timeout (an in-process call cannot be interrupted once a
// synchronous engine execution, e.g. a slow @query, is underway).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'livestage/parser'
import { strip, applyMasking, parseTraceConfig, emitRecord } from 'livestage/engine'

export const RENDER_TIMEOUT_MS = 5000

export interface HookToolOutput {
  content?: string
  isError?: boolean
}

export interface HookInput {
  tool_name: string
  tool_input: { file_path?: string }
  tool_output?: HookToolOutput
}

export interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: 'PostToolUse'
    updatedToolOutput: { content: string; isError: boolean }
  }
}

export function shouldHandle(input: HookInput): boolean {
  if (input.tool_name !== 'Read') return false
  const path = input.tool_input.file_path
  return typeof path === 'string' && path.endsWith('.stage')
}

function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return startDir  // reached filesystem root, give up
    dir = parent
  }
}

function cliEntryPath(): string {
  // Resolved from the package root rather than assumed relative to this
  // file's own location: under a real install this file runs compiled from
  // dist/hook/pretooluse.js, but under vitest it runs transformed straight
  // from src/hook/pretooluse.ts, a different depth from dist/cli/cli.js.
  const here = dirname(fileURLToPath(import.meta.url))
  const root = findPackageRoot(here)
  // Prefer the esbuild single-file bundle (feature 41): one module load
  // instead of resolving the whole tsc dist/ tree on every render, live-
  // measured at roughly 40% faster cold start. Business rule 3 requires
  // init to wire the hook to the bundle; this is the other half of that,
  // the render spawn itself. Falls back to the tsc multi-file build when
  // the bundle hasn't been produced (a source checkout that ran `npm run
  // build` but not `npm run bundle`, e.g. most local dev and this file's
  // own test suite).
  const bundlePath = join(root, 'dist', 'livestage.js')
  if (existsSync(bundlePath)) return bundlePath
  return join(root, 'dist', 'cli', 'cli.js')
}

function cacheDirFor(filePath: string): string {
  return join(dirname(filePath), '.livestage', 'cache')
}

function cachePathFor(filePath: string): string {
  const hash = createHash('sha256').update(resolve(filePath)).digest('hex').slice(0, 16)
  return join(cacheDirFor(filePath), `${hash}.md`)
}

function writeRenderCache(filePath: string, rendered: string): void {
  try {
    const dir = cacheDirFor(filePath)
    mkdirSync(dir, { recursive: true })
    // Masked before write, same rule as the engine's own cache (CR-5
    // business rule 7): the cache file persists on disk indefinitely and is
    // outside cache.ts's readCache/showCacheEntries visibility entirely, so
    // it gets its own masking pass rather than inheriting one.
    const { masked } = applyMasking(rendered)
    writeFileSync(cachePathFor(filePath), masked, 'utf8')
  } catch {
    // Cache write is best-effort; a failure here must never affect the
    // substitution the caller already has in hand.
  }
}

function degradedFallback(filePath: string, rawContent: string, reason: string): string {
  let stripOutput: string
  try {
    const ast = parse(rawContent, { filePath })
    stripOutput = strip(ast).output
  } catch {
    stripOutput = rawContent
  }
  return `> [!NOTE] degraded render (${reason})\n\n${stripOutput}`
}

// The render-level trace record engine.ts emits at the end of execute()
// always hardcodes degraded: false, because the ENGINE never knows it is
// being called from a hook that might kill it mid-render: that knowledge
// lives one process up, here. When the child is killed by the timeout, it
// never reaches its own emitRecord call at all, so no trace record for
// that attempt exists anywhere; a non-timeout spawn failure similarly never
// ran the engine. Either way, this is the only place that can honestly
// record "this render was degraded", so it emits its own record using the
// same trace sink/config the engine itself would have used.
function emitDegradedTrace(filePath: string, ms: number, exit: number): void {
  try {
    const config = parseTraceConfig(process.env['LIVESTAGE_TRACE'], dirname(filePath))
    if (!config) return
    emitRecord({ t: 'render', render_id: randomUUID(), doc: filePath, ms, directives: 0, degraded: true, exit }, config)
  } catch {
    // Trace emission is best-effort; it must never be the reason a
    // degraded render fails to produce its fallback content.
  }
}

/**
 * Render `filePath` via the same code path as `cli render`, spawned as a
 * child process so a slow render (e.g. a document full of @test/@query
 * calls) can actually be killed at the timeout rather than just outlasting
 * an in-process deadline check.
 */
export function renderViaCli(filePath: string, timeoutMs: number = RENDER_TIMEOUT_MS): { output: string; degraded: boolean } {
  // Explicit --cwd: the spawned process's own cwd is wherever the hook
  // itself launched from (the installed package, not the caller's project),
  // so without this the child would resolve .livestage/policy.json against
  // the wrong directory and silently apply the wrong grants.
  const startedAt = Date.now()
  const result = spawnSync(process.execPath, [cliEntryPath(), 'render', filePath, '--cwd', dirname(filePath), '--silent'], {
    encoding: 'utf8',
    timeout: timeoutMs,
  })
  if (result.error || result.status !== 0 || result.signal) {
    const raw = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
    const reason = result.signal === 'SIGTERM' ? 'render exceeded timeout' : 'render failed'
    emitDegradedTrace(filePath, Date.now() - startedAt, result.status ?? 1)
    return { output: degradedFallback(filePath, raw, reason), degraded: true }
  }
  return { output: result.stdout, degraded: false }
}

/**
 * The hook's decision for one PostToolUse event. Never throws: any failure
 * fails open (returns `{}`, the original tool_output.content stands), per
 * business rule 5.
 */
export function handlePostToolUse(input: HookInput): HookOutput {
  try {
    if (!shouldHandle(input)) return {}
    const filePath = input.tool_input.file_path!
    if (!existsSync(filePath)) return {}
    const { output } = renderViaCli(filePath)
    writeRenderCache(filePath, output)
    return {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        updatedToolOutput: { content: output, isError: false },
      },
    }
  } catch {
    return {}
  }
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf8')
  } catch {
    return ''
  }
}

export function main(): void {
  const raw = readStdin()
  let input: HookInput
  try {
    input = JSON.parse(raw) as HookInput
  } catch {
    process.stdout.write('{}\n')
    return
  }
  const output = handlePostToolUse(input)
  process.stdout.write(JSON.stringify(output) + '\n')
}

// Only run when invoked directly as the hook command (`node pretooluse.js`),
// never when imported by tests or by cli/index.ts's re-exports.
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
