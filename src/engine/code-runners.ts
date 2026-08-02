import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanInterpolations } from 'livestage/parser'
import type { CodeNode } from 'livestage/parser'
import type { EngineContext } from './context.js'
import { resolveDataPath } from './sources.js'
import { resolveInterpolations } from './engine-interpolate.js'
import { buildLiveStageContextJson } from './args.js'

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

function runMockCode(node: CodeNode, ctx: EngineContext): string | null {
  if (node.cache?.mode !== 'mock' || !node.cache.mockPath) return null
  const full = resolveDataPath(node.cache.mockPath, ctx, '@code mock')
  if (!full) return ''
  let stdout: string
  try { stdout = readFileSync(full, 'utf8') } catch { return '' }

  const base: CodeResult = { _exit: 0, _stdout: stdout, _stderr: '', _duration: 0 }
  let structured: Record<string, unknown> = { ...base }
  try {
    const parsed: unknown = JSON.parse(stdout)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      structured = { ...base, ...(parsed as Record<string, unknown>) }
    }
  } catch { /* stdout is not JSON; base result stands alone */ }

  if (node.label) {
    ctx.data[node.label] = structured
    ctx.envFiles[node.label] = stdout
    ctx.envFiles[`${node.label}_exit`] = '0'
  }
  return stdout
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

  const timeout = node.timeout ?? codeConfig?.timeout ?? 30_000
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

  let structured: Record<string, unknown> = { ...base }
  try {
    const parsed: unknown = JSON.parse(stdout)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      structured = { ...base, ...(parsed as Record<string, unknown>) }
    }
  } catch {
    // stdout is not JSON; base result stands alone.
  }

  const label = node.label
  if (label) {
    ctx.data[label] = structured
    ctx.envFiles[label] = stdout
    ctx.envFiles[`${label}_exit`] = String(exit)
  }

  return stdout
}
