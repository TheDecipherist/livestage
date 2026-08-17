import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLAUDE_MD_SECTION, SECTION_START_MARKER, SECTION_END_MARKER } from '../templates/claude-section.js'
import { checkAbsolutePath, defaultSecurityConfig } from 'livestage/engine'

export type ClientType = 'claude-code' | 'cursor' | 'auto'

export interface InitOptions {
  client?: ClientType
  cwd?: string
  /**
   * Override the user's home directory. Used by tests to redirect file
   * writes into a tmpdir without touching the real ~/.claude/ or
   * ~/.livestage/. Defaults to `os.homedir()`.
   */
  homeDir?: string
}

export interface InitResult {
  success: boolean
  clientDetected: string
  configPath: string
  alreadyInstalled: boolean
  message: string
  // Whether "livestage" resolved on PATH after install (business rule 1).
  // Absent on a failed init, since the check never runs in that path.
  pathVerified?: boolean
}

/**
 * The PreToolUse hook is a single built module (src/hook/pretooluse.ts,
 * feature 11): it fires on a pure .stage extension match and substitutes
 * the rendered document, no content sniffing. Init registers the INSTALLED
 * package's own dist/hook/pretooluse.js directly rather than writing a
 * separate wrapper script under ~/.livestage/hooks/, there is nothing for
 * a wrapper to do that the built module doesn't already do, and a wrapper
 * would be a second copy of the hook that could drift from the real one.
 */
function resolvePretoolUseHookPath(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  let dir = here
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return join(dir, 'dist', 'hook', 'pretooluse.js')
}

function detectClient(): { type: ClientType; configPath: string } {
  // Claude Code
  const claudeSettings = join(homedir(), '.claude', 'settings.json')
  if (existsSync(claudeSettings)) return { type: 'claude-code', configPath: claudeSettings }
  // Cursor
  const cursorSettings = join(homedir(), '.cursor', 'settings.json')
  if (existsSync(cursorSettings)) return { type: 'cursor', configPath: cursorSettings }
  // Default to claude-code
  return { type: 'claude-code', configPath: claudeSettings }
}

export interface InitClaudeMdOptions {
  claudeMdPath?: string
  update?: boolean
}

export interface InitClaudeMdResult {
  updated: boolean
  alreadyPresent: boolean
  claudeMdPath: string
}

export function stripClaudeMdSection(content: string): string {
  const startIdx = content.indexOf(SECTION_START_MARKER)
  if (startIdx === -1) return content

  const endIdx = content.indexOf(SECTION_END_MARKER, startIdx)
  const blockEnd = endIdx === -1
    ? content.length
    : endIdx + SECTION_END_MARKER.length

  const before = content.slice(0, startIdx).replace(/\n+$/, '')
  const after = content.slice(blockEnd).replace(/^\n+/, '')

  if (before === '' && after === '') return ''
  if (before === '') return after
  if (after === '') return before
  return before + '\n\n' + after
}

export function runInitClaudeMd(options: InitClaudeMdOptions = {}): InitClaudeMdResult {
  const claudeMdPath = options.claudeMdPath ?? join(homedir(), '.claude', 'CLAUDE.md')

  if (checkAbsolutePath(claudeMdPath).level === 'blocked') {
    return { updated: false, alreadyPresent: false, claudeMdPath }
  }

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf8')
    if (existing.includes(SECTION_START_MARKER)) {
      if (!options.update) return { updated: false, alreadyPresent: true, claudeMdPath }
      const stripped = stripClaudeMdSection(existing)
      const separator = stripped.endsWith('\n') ? '\n' : '\n\n'
      writeFileSync(claudeMdPath, stripped + separator + CLAUDE_MD_SECTION + '\n', 'utf8')
      return { updated: true, alreadyPresent: true, claudeMdPath }
    }
    const separator = existing.endsWith('\n') ? '\n' : '\n\n'
    writeFileSync(claudeMdPath, existing + separator + CLAUDE_MD_SECTION + '\n', 'utf8')
  } else {
    mkdirSync(dirname(claudeMdPath), { recursive: true })
    writeFileSync(claudeMdPath, CLAUDE_MD_SECTION + '\n', 'utf8')
  }

  return { updated: true, alreadyPresent: false, claudeMdPath }
}

/**
 * The SessionStart hook script. Installed to ~/.livestage/hooks/sessionStart.mjs
 * by `livestage init`. Runs at session start (source: `startup` | `resume` |
 * `clear` | `compact`) and injects the rendered content of
 * `<cwd>/CLAUDE-LiveStage.stage`
 * into Claude's session context via the `hookSpecificOutput.additionalContext`
 * JSON channel.
 *
 * Design intent:
 *   - The user's CLAUDE.md is NEVER touched. The hook makes zero filesystem
 *     writes - the rendered content lives only in conversation context for
 *     this session.
 *   - `CLAUDE-LiveStage.stage` is a separate file the user creates and
 *     edits, a normal .stage document rendered in one shot via
 *     `livestage render`.
 *   - Direct Read of `CLAUDE-LiveStage.stage` is handled transparently by
 *     the PreToolUse hook (feature 11): it substitutes the rendered content
 *     in place of the raw source, no separate re-fetch step needed.
 *
 * No-op when:
 *   - `CLAUDE-LiveStage.stage` doesn't exist (project hasn't adopted the feature)
 *   - `livestage` is not on PATH (warn to stderr, exit 0)
 *   - `livestage render` fails (warn to stderr, exit 0; Claude sees no extra context)
 *
 * Never blocks session start - always exits 0.
 */
export const SESSION_START_HOOK_SCRIPT = `#!/usr/bin/env node
// LiveStage SessionStart hook - installed by livestage init
//
// Renders <cwd>/CLAUDE-LiveStage.stage via the livestage CLI and injects the result
// into Claude's session context via hookSpecificOutput.additionalContext.
//
// CLAUDE.md is never touched. CLAUDE-LiveStage.stage is a separate file the
// user creates and edits. The render output lives only in conversation
// context for this session, never written to disk.
//
// No-op when CLAUDE-LiveStage.stage doesn't exist or livestage render fails.
// Never blocks session start (always exits 0).
import { createInterface } from 'node:readline'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

let raw = ''
if (process.stdin.isTTY) process.exit(0)
for await (const line of createInterface({ input: process.stdin })) raw += line

try {
  const data = raw ? JSON.parse(raw) : {}
  const cwd = data.cwd || data.tool_input?.cwd || process.cwd()
  const filePath = join(cwd, 'CLAUDE-LiveStage.stage')

  if (!existsSync(filePath)) process.exit(0)

  const result = spawnSync('livestage', ['render', filePath], {
    encoding: 'utf8',
    cwd,
    timeout: 30_000,
  })

  if (result.error) {
    // livestage CLI not on PATH (ENOENT) or another spawn-level failure.
    process.stderr.write('LiveStage SessionStart hook: cannot invoke "livestage render" (' + String(result.error) + '). Session continues without CLAUDE-LiveStage.stage context.\\n')
    process.exit(0)
  }

  if (result.status !== 0) {
    process.stderr.write('LiveStage SessionStart hook: livestage render failed for CLAUDE-LiveStage.stage. Session continues without injected context.\\n')
    if (result.stderr) process.stderr.write(result.stderr + '\\n')
    process.exit(0)
  }

  const rendered = result.stdout || ''
  if (rendered.trim() === '') process.exit(0)

  const payload = {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: rendered,
    },
  }
  process.stdout.write(JSON.stringify(payload))
  process.exit(0)
} catch (err) {
  process.stderr.write('LiveStage SessionStart hook error: ' + String(err) + '\\n')
  process.exit(0)
}
`

// Transactional rollback (business rule 5): each write init performs
// records how to undo itself BEFORE it happens, pushed onto a shared
// stack. If a later step in the same runInit() call throws (a permission
// error on the second or third write, say), the caller runs every
// recorded undo in reverse order, so a partial failure leaves the
// filesystem exactly as it was before init started, not a half-installed
// state. A step that never got recorded (because it threw before pushing
// its own undo) has nothing to roll back, which is correct: it never
// wrote anything.
type Undo = () => void

function snapshotFile(path: string): Undo {
  if (existsSync(path)) {
    const original = readFileSync(path, 'utf8')
    return () => { writeFileSync(path, original, 'utf8') }
  }
  return () => { try { unlinkSync(path) } catch { /* already gone, nothing to roll back */ } }
}

function ensureSessionStartHookFile(hookDir: string, hookPath: string, undoStack: Undo[]): void {
  mkdirSync(hookDir, { recursive: true })
  const hookAlreadyExists = existsSync(hookPath) &&
    readFileSync(hookPath, 'utf8').includes('LiveStage SessionStart hook')
  if (!hookAlreadyExists) {
    undoStack.push(snapshotFile(hookPath))
    writeFileSync(hookPath, SESSION_START_HOOK_SCRIPT, 'utf8')
  }
}

interface HookUpdateResult {
  alreadyInstalled: boolean
  error?: string
}

function updateClientHooks(configPath: string, hookPath: string, sessionStartHookPath: string, undoStack: Undo[]): HookUpdateResult {
  let config: Record<string, unknown> = {}
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    } catch (err) {
      return { alreadyInstalled: false, error: `Cannot parse settings file at ${configPath}: ${String(err)}` }
    }
  }
  const hooks = (config['hooks'] as Record<string, unknown> | undefined) ?? {}

  // PreToolUse: render .stage documents in place of the raw Read (feature 11).
  const preEntries = Array.isArray(hooks['PreToolUse']) ? hooks['PreToolUse'] as unknown[] : []
  const preAlreadyInstalled = preEntries.some((entry: unknown) => {
    const e = entry as Record<string, unknown>
    const subhooks = Array.isArray(e['hooks']) ? e['hooks'] as Array<Record<string, unknown>> : []
    // Match against the real hook path being registered, not a guessed
    // substring: a prior version checked for the literal text "preToolUse"
    // (camelCase), but the actual command references pretooluse.js (all
    // lowercase, the built module's real filename), so the check never
    // matched and every init call duplicated the PreToolUse entry.
    return subhooks.some(h => typeof h['command'] === 'string' && h['command'].includes(hookPath))
  })
  if (!preAlreadyInstalled) {
    hooks['PreToolUse'] = [...preEntries, { matcher: 'Read', hooks: [{ type: 'command', command: `node ${hookPath}` }] }]
  }

  // SessionStart: render CLAUDE-LiveStage.stage and inject as additionalContext
  const startEntries = Array.isArray(hooks['SessionStart']) ? hooks['SessionStart'] as unknown[] : []
  const startAlreadyInstalled = startEntries.some((entry: unknown) => {
    const e = entry as Record<string, unknown>
    const subhooks = Array.isArray(e['hooks']) ? e['hooks'] as Array<Record<string, unknown>> : []
    return subhooks.some(h => typeof h['command'] === 'string' && h['command'].includes('sessionStart'))
  })
  if (!startAlreadyInstalled) {
    hooks['SessionStart'] = [...startEntries, { hooks: [{ type: 'command', command: `node ${sessionStartHookPath}` }] }]
  }

  const alreadyInstalled = preAlreadyInstalled && startAlreadyInstalled
  if (!alreadyInstalled) {
    config['hooks'] = hooks
    mkdirSync(dirname(configPath), { recursive: true })
    undoStack.push(snapshotFile(configPath))
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8')
  }
  return { alreadyInstalled }
}

// Seeds <cwd>/.livestage/policy.json with the shipped "strict" profile
// (CR-5, business rule 1, see 06-cr5-deny-by-default.md's Implementation
// Notes for the full rationale). "Strict" names the ENFORCEMENT MODEL, not
// "shell is off": every surface not explicitly granted is denied, hard
// destructive patterns are immutable regardless of policy, @code and HTTP
// ship empty, and there is no reach outside the project root. Shell itself
// ships with a curated, read-only allowlist (git/cat/grep/find/the test
// runners, ~40 patterns), deliberately, not by oversight: without it
// @query is dead on arrival and @test/@check cannot auto-detect a runner,
// found and fixed as a real bug during this project's own wave-2 build.
// A no-op, not an overwrite, when a policy file already exists, consistent
// with init's idempotence rule (business rule 1, re-run is a no-op).
function ensureProjectPolicy(cwd: string, undoStack: Undo[]): { seeded: boolean; policyPath: string } {
  const policyPath = join(cwd, '.livestage', 'policy.json')
  if (existsSync(policyPath)) return { seeded: false, policyPath }
  mkdirSync(dirname(policyPath), { recursive: true })
  undoStack.push(snapshotFile(policyPath))
  writeFileSync(policyPath, JSON.stringify(defaultSecurityConfig(), null, 2) + '\n', 'utf8')
  return { seeded: true, policyPath }
}

// Business rule 1 ("verifies the bundle on PATH"): a courtesy check, not a
// gate. The SessionStart hook script already handles "livestage not on
// PATH" gracefully at runtime (warns to stderr, never blocks a session),
// but nothing told the person running init that it would happen. A short
// timeout since this only needs to prove the binary resolves, not do real
// work; failure here never fails init itself.
function verifyBundleOnPath(): boolean {
  try {
    const result = spawnSync('livestage', ['--version'], { encoding: 'utf8', timeout: 3000 })
    return !result.error && result.status === 0
  } catch {
    return false
  }
}

export function runInit(options: InitOptions = {}): InitResult {
  const home = options.homeDir ?? homedir()
  const cwd = options.cwd ?? process.cwd()
  const detected = options.client === 'auto' || !options.client ? detectClient() : null
  const clientType = options.client && options.client !== 'auto' ? options.client : (detected?.type ?? 'claude-code')
  const configPath = clientType === 'cursor'
    ? join(home, '.cursor', 'settings.json')
    : join(home, '.claude', 'settings.json')

  if (checkAbsolutePath(configPath).level === 'blocked') {
    return { success: false, clientDetected: clientType, configPath, alreadyInstalled: false, message: `Config path blocked: ${configPath}` }
  }

  const hookPath = resolvePretoolUseHookPath()
  const hookDir = join(home, '.livestage', 'hooks')
  const sessionStartHookPath = join(hookDir, 'sessionStart.mjs')

  const undoStack: Undo[] = []
  let result: HookUpdateResult
  let policyResult: { seeded: boolean; policyPath: string }
  try {
    ensureSessionStartHookFile(hookDir, sessionStartHookPath, undoStack)
    result = updateClientHooks(configPath, hookPath, sessionStartHookPath, undoStack)
    if (result.error) {
      // Not a thrown exception: updateClientHooks reports a parse failure
      // as a result field, not a throw, and never got as far as writing
      // anything for this call, so there is nothing this specific step
      // needs rolled back. Earlier steps (the session-start hook file)
      // still get their own rollback below, same as any other failure.
      throw new Error(result.error)
    }
    policyResult = ensureProjectPolicy(cwd, undoStack)
  } catch (err) {
    for (const undo of undoStack.reverse()) {
      try { undo() } catch { /* best-effort rollback; the original error is what gets reported */ }
    }
    return { success: false, clientDetected: clientType, configPath, alreadyInstalled: false, message: `init failed, rolled back: ${String(err instanceof Error ? err.message : err)}` }
  }

  const hookMessage = result.alreadyInstalled
    ? `LiveStage hooks already installed in ${configPath}`
    : `LiveStage hooks installed in ${configPath}`
  const policyMessage = policyResult.seeded
    ? ` and policy seeded at ${policyResult.policyPath}`
    : ` (policy already present at ${policyResult.policyPath})`
  const pathVerified = verifyBundleOnPath()
  const pathMessage = pathVerified
    ? ''
    : ' (WARNING: "livestage" is not resolvable on PATH; the SessionStart hook will not be able to run render calls until it is)'

  return {
    success: true,
    clientDetected: clientType,
    configPath,
    alreadyInstalled: result.alreadyInstalled,
    pathVerified,
    message: hookMessage + policyMessage + pathMessage,
  }
}
