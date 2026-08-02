import { readFileSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'livestage/parser'
import { loadSecurityConfig } from 'livestage/engine'
import { checkInertDoc, checkArgsWithoutFallback } from '../../engine/assert/liveness.js'
import { expandFileGlob } from '../glob-expand.js'
import { runAssert } from './assert.js'

export interface DoctorOptions {
  cwd?: string
  homeDir?: string
  json?: boolean
  rulesFor?: string
}

export interface DoctorCheck {
  name: string
  healthy: boolean
  detail: string
}

export interface DoctorHealth {
  healthy: boolean
  version: string
  checks: DoctorCheck[]
}

export interface RulesForEntry {
  file: string
  target: string
  operator: string
  passed: boolean
}

export interface RulesForResult {
  file: string
  matches: RulesForEntry[]
  coverage: number  // fraction of matches that passed, 0 when there are no matches
}

function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (;;) {
    if (existsSync(join(dir, 'package.json'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
}

function getVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url))
  const root = findPackageRoot(here)
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

function checkHooksRegistered(homeDir: string): DoctorCheck {
  const settingsPath = join(homeDir, '.claude', 'settings.json')
  if (!existsSync(settingsPath)) {
    return { name: 'hooks', healthy: false, detail: `not installed: ${settingsPath} does not exist (run livestage init)` }
  }
  let settings: { hooks?: { PreToolUse?: Array<{ hooks?: Array<{ command?: string }> }> } }
  try {
    settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as typeof settings
  } catch (err) {
    return { name: 'hooks', healthy: false, detail: `cannot parse ${settingsPath}: ${String(err)}` }
  }
  const commands = (settings.hooks?.PreToolUse ?? []).flatMap(e => e.hooks ?? []).map(h => h.command ?? '')
  const hookCommand = commands.find(c => c.includes('pretooluse.js'))
  if (!hookCommand) {
    return { name: 'hooks', healthy: false, detail: 'PreToolUse hook not registered (run livestage init)' }
  }
  const hookPath = hookCommand.replace(/^node\s+/, '').trim()
  if (!existsSync(hookPath)) {
    return { name: 'hooks', healthy: false, detail: `registered hook file missing: ${hookPath}` }
  }
  return { name: 'hooks', healthy: true, detail: `registered: ${hookPath}` }
}

function findStageFiles(cwd: string): string[] {
  return expandFileGlob('**/*.stage', cwd)
}

function checkDocsParse(cwd: string): DoctorCheck {
  const files = findStageFiles(cwd)
  const failures: string[] = []
  for (const file of files) {
    try {
      const source = readFileSync(resolve(cwd, file), 'utf8')
      parse(source, { filePath: resolve(cwd, file) })
    } catch (err) {
      failures.push(`${file}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (failures.length > 0) {
    return { name: 'docsParsed', healthy: false, detail: `${failures.length}/${files.length} failed to parse: ${failures.join('; ')}` }
  }
  return { name: 'docsParsed', healthy: true, detail: `${files.length}/${files.length} .stage files parse cleanly` }
}

function checkPolicy(cwd: string): DoctorCheck {
  try {
    const config = loadSecurityConfig(undefined, cwd)
    const detail = `shell=${config.shell.enabled} http=${config.http.enabled} code=[${config.code.languages.join(',')}]`
    return { name: 'policy', healthy: true, detail }
  } catch (err) {
    return { name: 'policy', healthy: false, detail: `failed to load: ${String(err)}` }
  }
}

function checkTraceWritable(cwd: string): DoctorCheck {
  const traceDir = join(cwd, '.livestage', 'trace')
  const probePath = join(traceDir, '.doctor-probe')
  try {
    mkdirSync(traceDir, { recursive: true })
    writeFileSync(probePath, '', 'utf8')
    unlinkSync(probePath)
    return { name: 'trace', healthy: true, detail: `${traceDir} writable` }
  } catch (err) {
    return { name: 'trace', healthy: false, detail: `${traceDir} not writable: ${String(err)}` }
  }
}

function checkAssertionLiveness(cwd: string): DoctorCheck {
  const files = findStageFiles(cwd)
  let totalAsserts = 0
  let inertDocs = 0
  let argsIssues = 0
  for (const file of files) {
    try {
      const source = readFileSync(resolve(cwd, file), 'utf8')
      const ast = parse(source, { filePath: resolve(cwd, file) })
      const assertCount = ast.nodes.filter(n => n.type === 'assert').length
      totalAsserts += assertCount
      if (checkInertDoc(ast.nodes)) inertDocs++
      if (checkArgsWithoutFallback(ast.nodes)) argsIssues++
    } catch {
      // Parse failures are reported by the docsParsed check; skip here.
    }
  }
  const healthy = inertDocs === 0
  return {
    name: 'assertions',
    healthy,
    detail: `${totalAsserts} @assert directives across ${files.length} docs, ${inertDocs} inert doc(s), ${argsIssues} doc(s) with unguarded args`,
  }
}

function checkSchemas(cwd: string): DoctorCheck {
  const schemaDir = join(cwd, '.livestage', 'schemas')
  if (!existsSync(schemaDir)) {
    return { name: 'schemas', healthy: true, detail: 'no .livestage/schemas/ directory (schema engine is feature 32, wave 5, not built yet)' }
  }
  return { name: 'schemas', healthy: true, detail: `${schemaDir} present (validation not implemented yet, feature 32)` }
}

export function runDoctor(options: DoctorOptions = {}): DoctorHealth {
  const cwd = options.cwd ?? process.cwd()
  const homeDir = options.homeDir ?? process.env['HOME'] ?? ''
  const checks: DoctorCheck[] = [
    checkHooksRegistered(homeDir),
    checkDocsParse(cwd),
    checkPolicy(cwd),
    checkTraceWritable(cwd),
    checkAssertionLiveness(cwd),
    checkSchemas(cwd),
  ]
  return {
    healthy: checks.every(c => c.healthy),
    version: getVersion(),
    checks,
  }
}

export function runDoctorRulesFor(targetFile: string, options: DoctorOptions = {}): RulesForResult {
  const cwd = options.cwd ?? process.cwd()
  const files = findStageFiles(cwd)
  const matches: RulesForEntry[] = []
  for (const file of files) {
    let source: string
    try {
      source = readFileSync(resolve(cwd, file), 'utf8')
    } catch {
      continue
    }
    let ast: ReturnType<typeof parse>
    try {
      ast = parse(source, { filePath: resolve(cwd, file) })
    } catch {
      continue
    }
    const targetsInFile = ast.nodes.some(n => n.type === 'assert' && (n.target === targetFile || n.target.includes(targetFile)))
    if (!targetsInFile) continue
    // Actually execute the file's assertions to get real pass state, not
    // just a structural listing of which ones exist.
    const run = runAssert(file, { cwd })
    for (const fileResult of run.files) {
      for (const result of fileResult.results) {
        if (result.target === targetFile || result.target.includes(targetFile)) {
          matches.push({ file, target: result.target, operator: result.operator, passed: result.passed })
        }
      }
    }
  }
  const coverage = matches.length > 0 ? matches.filter(m => m.passed).length / matches.length : 0
  return { file: targetFile, matches, coverage }
}
