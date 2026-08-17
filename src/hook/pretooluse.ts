// The PostToolUse hook that renders `.stage` files in place of the raw Read,
// AND (Part 5, feat/drift-gates) keeps a generated `.md`'s own committed
// bytes honest against its `.stage` source under the document's own
// control, since agents read CLAUDE.md and README.md; the `.stage` is the
// source almost nobody opens, the guarantee used to land on the wrong file.
//
// Named `pretooluse.ts` to match the spec's file layout, but it registers as
// a PostToolUse hook in Claude Code's settings.json: PreToolUse can only
// allow/deny/rewrite tool ARGUMENTS (`updatedInput`), it cannot substitute
// the content a Read call returns. PostToolUse can, via
// `hookSpecificOutput.updatedToolOutput.content`. Re-verified against the
// installed Claude Code binary's own embedded strings, not just docs
// (feature-doc citations can go stale): "Replaces the tool output before it
// is sent to the model" for `updatedToolOutput` ("works for all tools"),
// versus PreToolUse's `updatedInput`/`permissionDecision` only, and a hook's
// `updatedToolOutput` must match the ORIGINATING tool's own output shape
// (confirmed by the binary's own validation error message), which is why
// this stays an object with `content`/`isError`, not a bare string.
//
// Fires on a pure `.stage` OR `.md` extension match, nothing else (CR-3, no
// content sniffing AT THIS LAYER): shouldHandle never opens the file.
// Whether a `.md` actually carries the livestage:generated contract (Part
// 5.1) is a content question, answered inside handlePostToolUse once the
// file is already being read, exactly the same way the `.stage` path
// already has to read the file to render it. A `.md` with no metadata
// block at all is passed through completely untouched, filename coincidence
// with a same-named `.stage` sibling is never enough on its own.
//
// Renders via the exact same code path as `cli render` by spawning the
// built CLI binary as a child process, which also gives a real, killable
// timeout (an in-process call cannot be interrupted once a synchronous
// engine execution, e.g. a slow @query, is underway).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'livestage/parser'
import {
  strip, applyMasking, parseTraceConfig, emitRecord,
  parseGeneratedMetadata, stripGeneratedMetadataBlock, recomputeContentHash,
  type GeneratedMetadata,
} from 'livestage/engine'

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
  return typeof path === 'string' && (path.endsWith('.stage') || path.endsWith('.md'))
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
export function renderViaCli(filePath: string, timeoutMs: number = RENDER_TIMEOUT_MS, homeDir?: string): { output: string; degraded: boolean } {
  // Explicit --cwd: the spawned process's own cwd is wherever the hook
  // itself launched from (the installed package, not the caller's project),
  // so without this the child would resolve .livestage/policy.json against
  // the wrong directory and silently apply the wrong grants.
  // homeDir defaults to unset, which the CLI itself then resolves to the
  // real os.homedir() (the real user's real workspace-trust store); tests
  // override it to isolate trust state without touching that store.
  const startedAt = Date.now()
  const args = [cliEntryPath(), 'render', filePath, '--cwd', dirname(filePath), '--silent']
  if (homeDir) args.push('--home-dir', homeDir)
  const result = spawnSync(process.execPath, args, {
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
    if (filePath.endsWith('.stage')) {
      const { output } = renderViaCli(filePath)
      writeRenderCache(filePath, output)
      return substitute(output)
    }
    return handleGeneratedMarkdownRead(filePath)
  } catch {
    return {}
  }
}

function substitute(content: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      updatedToolOutput: { content, isError: false },
    },
  }
}

// Part 5 (feat/drift-gates): a .md read is only ever substituted when the
// file carries the livestage:generated metadata block (Part 5.1) AND that
// block names a source. No block, or a block with no livestage_source:
// pass through untouched, filename coincidence with a same-named .stage
// sibling is never enough on its own.
function handleGeneratedMarkdownRead(filePath: string): HookOutput {
  const committed = readFileSync(filePath, 'utf8')
  const metadata = parseGeneratedMetadata(committed)
  if (!metadata || !metadata.livestage_source) return {}

  const mdDir = dirname(filePath)

  // Cheap pre-check (Part 5.2): an unchanged hash of the declared inputs
  // serves the committed file immediately with no render at all, the
  // hot-path case. recomputeContentHash returning null (no source to
  // resolve) falls through to the full render-and-compare path below
  // rather than guessing.
  const freshHash = recomputeContentHash(metadata, mdDir)
  if (freshHash !== null && freshHash === metadata.livestage_content_hash) {
    return {}
  }

  const sourcePath = resolve(mdDir, metadata.livestage_source)
  if (!existsSync(sourcePath)) {
    return substitute(`${cannotVerifyNotice(metadata, 'source file not found')}\n\n${committed}`)
  }

  const { output: freshBody, degraded } = renderViaCli(sourcePath)
  if (degraded) {
    return substitute(`${cannotVerifyNotice(metadata, 'render failed or timed out')}\n\n${committed}`)
  }

  const freshNormalized = `${(freshBody.endsWith('\n') ? freshBody : `${freshBody}\n`).trim()}\n`
  const committedBody = `${stripGeneratedMetadataBlock(committed).trim()}\n`

  if (freshNormalized === committedBody) {
    // Identical: serve the committed file, say nothing. Rule 5.3's
    // overwhelmingly common case; the hash shortcut only ever widens the
    // net of "maybe render and check" without ever being wrong the other
    // way (a false "unchanged" would need a hash collision), the actual
    // render settles a hash-said-maybe-stale case for free.
    return {}
  }

  const regenerateOnRead = metadata.livestage_regenerate_on_read === 'true'
  const notice = staleNotice(metadata, filePath, regenerateOnRead)
  const body = regenerateOnRead ? freshNormalized : committedBody
  return substitute(`${notice}\n\n${body}`)
}

function regenCommandFor(source: string): string {
  // The two flagship generated files (Part 5's own motivation: agents
  // read these two, not their .stage source) get their real, exact
  // command; anything else gets the general form, since there is no
  // reviewed, committed mapping from an arbitrary .stage file to its own
  // npm script the way README.stage/CLAUDE.stage have one.
  if (source === 'README.stage') return 'npm run readme'
  if (source === 'CLAUDE.stage') return 'npm run claude-md'
  return `livestage build ${source} -o <output> --stamp-metadata`
}

// "Render fails or times out: serve the committed .md unchanged, with a
// notice that it may be stale and could not be verified. Never serve
// nothing, never fail the Read." (Part 5.3)
function cannotVerifyNotice(metadata: Partial<GeneratedMetadata>, reason: string): string {
  return `> [!NOTE] Could not verify freshness (${reason}). Showing the committed file as-is; it may be stale relative to \`${metadata.livestage_source}\`.`
}

// "Different: serve according to livestage_regenerate_on_read, and either
// way prepend a visible in-band notice: that the committed file is stale,
// which fields differ, and the exact command to regenerate." (Part 5.3)
// When serving fresh, the notice also states plainly that what follows is
// a render of the SOURCE, not the file's own committed bytes, so an agent
// that edits/greps/quotes it afterward knows which artifact it is holding.
function staleNotice(metadata: Partial<GeneratedMetadata>, mdFilePath: string, servingFresh: boolean): string {
  const source = metadata.livestage_source ?? '(unknown source)'
  const regenCmd = regenCommandFor(source)
  const fileName = mdFilePath.split('/').pop() ?? mdFilePath
  if (servingFresh) {
    return `> [!WARNING] **STALE, showing a FRESH render instead of the committed file.** \`${fileName}\`'s committed bytes do not match a fresh render of \`${source}\` (content hash differs). What follows is a LIVE RENDER of \`${source}\`, not \`${fileName}\`'s own committed bytes: an edit, grep, or quote against this content will not persist. Regenerate and commit with \`${regenCmd}\`.`
  }
  return `> [!WARNING] **STALE.** \`${fileName}\` does not match a fresh render of \`${source}\` (content hash differs). Showing the committed file. Regenerate with \`${regenCmd}\`, or set \`livestage_regenerate_on_read: true\` in its metadata block to always see a fresh render here instead.`
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
