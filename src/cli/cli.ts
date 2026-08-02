#!/usr/bin/env node
import { program } from 'commander'
import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runRender } from './commands/render.js'
import { runValidate } from './commands/validate.js'
import { runParse } from './commands/parse.js'
import { runEval } from './commands/eval.js'
import { runStrip } from './commands/strip.js'
import { runBuild } from './commands/build.js'
import { runInit, runInitClaudeMd } from './commands/init.js'
import { runCacheShow, runCacheClear } from './commands/cache.js'
import { runListMacros } from './commands/list-macros.js'
import { runListImports } from './commands/list-imports.js'
import { runWatch } from './commands/watch.js'
import { runEngineTrace } from './commands/engine-trace.js'
import { runAssert } from './commands/assert.js'
import { runDoctor, runDoctorRulesFor } from './commands/doctor.js'
import { expandFileGlob } from './glob-expand.js'
import { registerSecurity } from './cli-register-security.js'
import { getAvailableDirectives } from 'livestage/parser'

const universalOptions = (cmd: ReturnType<typeof program.command>) =>
  cmd
    .option('--env <file>', 'load .env file into environment')
    .option('--cwd <path>', 'override working directory')
    .option('--verbose', 'print warnings to stderr')
    .option('--strict', 'treat warnings as errors')
    .option('--silent', 'suppress all output except FATAL')

universalOptions(
  program
    .command('render <file>')
    .description('render a LiveStage document to markdown')
    .option('-o, --output <path>', 'write output to file instead of stdout')
    .option('--consumer <type>', 'target consumer: ai, human, or any custom value')
    .option('--format <mode>', 'output format: standard (default) or ai (token-efficient)')
    .option('--budget <n>', 'token budget — drop low-priority @section blocks to fit', parseInt)
    .option('--passthrough', 'pass plain markdown files through unchanged instead of erroring')
    .option('--skill-args <args>', 'skill ARGUMENTS string (for testing Claude Code skill files locally)')
    .option('--skill-dir <path>', 'skill directory ($CLAUDE_SKILL_DIR)')
    .option('--skill-session-id <id>', 'Claude Code session id ($CLAUDE_SESSION_ID)')
    .option('--skill-effort <level>', 'Claude effort level ($CLAUDE_EFFORT): low|medium|high|xhigh|max')
    .option('--args <string>', 'raw argument string, exposed as {{ args }} / {{ arg0 }}..{{ arg3 }}')
    .option('--var <k=v>', 'a named value, exposed as {{ vars.k }} (repeatable)', (v: string, prev: string[]) => [...prev, v], [] as string[])
).action((file: string, opts: Record<string, string | string[] | boolean | undefined>) => {
  const renderOpts: Parameters<typeof runRender>[1] = {
    ...opts,
    passthrough: Boolean(opts['passthrough']),
  }
  // Commander stores flags with kebab-case names as camelCase, but our options
  // come through as a string-keyed record. Map them explicitly.
  if (typeof opts['skillArgs'] === 'string') renderOpts.skillArgs = opts['skillArgs']
  if (typeof opts['skillDir'] === 'string') renderOpts.skillDir = opts['skillDir']
  if (typeof opts['skillSessionId'] === 'string') renderOpts.skillSessionId = opts['skillSessionId']
  if (typeof opts['skillEffort'] === 'string') renderOpts.skillEffort = opts['skillEffort']
  if (typeof opts['args'] === 'string') renderOpts.args = opts['args']
  if (Array.isArray(opts['var']) && opts['var'].length > 0) renderOpts.varFlags = opts['var']
  const result = runRender(file, renderOpts)
  for (const warn of result.warnings) {
    if (!opts['silent']) process.stderr.write(`WARN: ${warn}\n`)
  }
  for (const err of result.errors) {
    if (!opts['silent']) process.stderr.write(`ERROR: ${err}\n`)
  }
  if (result.exitCode !== 0) process.exit(1)
  if (opts['output']) {
    const content = result.output.endsWith('\n') ? result.output : result.output + '\n'
    writeFileSync(String(opts['output']), content)
  } else {
    process.stdout.write(result.output.endsWith('\n') ? result.output : result.output + '\n')
  }
})

universalOptions(
  program
    .command('validate <file|glob>')
    .description('parse and validate one or more LiveStage documents')
).action((pattern: string, opts: Record<string, string | boolean | undefined>) => {
  const cwd = typeof opts['cwd'] === 'string' ? opts['cwd'] : process.cwd()
  const files = expandFileGlob(pattern, cwd)
  if (files.length === 0) {
    process.stderr.write(`ERROR: no files matched: ${pattern}\n`)
    process.exit(2)
  }
  let anyInvalid = false
  for (const file of files) {
    const result = runValidate(file, opts)
    for (const err of result.errors) process.stderr.write(`ERROR: ${file}: ${err}\n`)
    for (const warn of result.warnings) {
      if (!opts['silent']) process.stderr.write(`WARN: ${file}: ${warn}\n`)
    }
    if (result.exitCode === 0) {
      if (!opts['silent']) process.stdout.write(`✓ ${file}: no errors\n`)
    } else {
      anyInvalid = true
    }
  }
  process.exit(anyInvalid ? 1 : 0)
})

universalOptions(
  program
    .command('assert <file|glob>')
    .description('run @assert directives in one or more documents as a CI gate')
).action((pattern: string, opts: Record<string, string | boolean | undefined>) => {
  const cwd = typeof opts['cwd'] === 'string' ? opts['cwd'] : process.cwd()
  const run = runAssert(pattern, { cwd, silent: Boolean(opts['silent']) })
  for (const file of run.files) {
    for (const err of file.errors) process.stderr.write(`ERROR: ${file.file}: ${err}\n`)
    for (const result of file.results) {
      const mark = result.passed ? '✓' : '✗'
      if (!opts['silent'] || !result.passed) {
        process.stdout.write(`${mark} ${file.file}: ${result.operator} ${result.target} (${result.matches} matches)\n`)
      }
    }
  }
  process.exit(run.exitCode)
})

universalOptions(
  program
    .command('doctor')
    .description('check project health: hooks, policy, .stage parse, trace, assertion liveness')
    .option('--json', 'emit machine-readable health as JSON')
    .option('--rules-for <file>', 'list assertion documents whose targets match this file')
    .option('--home-dir <path>', 'override the home directory used to locate the hook registration (testing only)')
).action((opts: Record<string, string | boolean | undefined>) => {
  const cwd = typeof opts['cwd'] === 'string' ? opts['cwd'] : process.cwd()
  const homeDir = typeof opts['homeDir'] === 'string' ? opts['homeDir'] : undefined
  const doctorOpts: Parameters<typeof runDoctor>[0] = { cwd, ...(homeDir !== undefined ? { homeDir } : {}) }

  if (opts['rulesFor']) {
    const result = runDoctorRulesFor(String(opts['rulesFor']), doctorOpts)
    if (opts['json']) {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    } else {
      process.stdout.write(`${result.file}: ${result.matches.length} assertion(s), coverage ${(result.coverage * 100).toFixed(0)}%\n`)
      for (const m of result.matches) {
        process.stdout.write(`  ${m.passed ? '✓' : '✗'} ${m.file}: ${m.operator} ${m.target}\n`)
      }
    }
    process.exit(0)
  }

  const health = runDoctor(doctorOpts)
  if (opts['json']) {
    process.stdout.write(JSON.stringify(health, null, 2) + '\n')
  } else if (health.healthy) {
    process.stdout.write(`livestage ${health.version}: healthy (${health.checks.length} checks passed)\n`)
  } else {
    process.stdout.write(`livestage ${health.version}: UNHEALTHY\n`)
    for (const check of health.checks) {
      if (!check.healthy) process.stdout.write(`  ✗ ${check.name}: ${check.detail}\n`)
    }
  }
  process.exit(health.healthy ? 0 : 1)
})

const parser = program.command('parser').description('inspect the .stage grammar (ast, directives, imports, macros)')

universalOptions(
  parser
    .command('ast <file>')
    .description('output the raw AST as JSON')
    .option('--node <type>', 'filter to specific node type')
    .option('--pretty', 'pretty-print JSON output')
).action((file: string, opts: Record<string, string | boolean | undefined>) => {
  const parseOpts: import('./commands/parse.js').ParseCmdOptions = { pretty: Boolean(opts['pretty']) }
  if (opts['cwd']) parseOpts.cwd = String(opts['cwd'])
  if (opts['node']) parseOpts.node = String(opts['node'])
  const result = runParse(file, parseOpts)
  for (const err of result.errors) process.stderr.write(`ERROR: ${err}\n`)
  if (result.exitCode !== 0) process.exit(1)
  process.stdout.write(result.output + '\n')
})

universalOptions(
  parser.command('directives')
    .description('list the authoritative directive registry')
).action((opts: Record<string, boolean | undefined>) => {
  if (!opts['silent']) {
    for (const d of getAvailableDirectives()) process.stdout.write(`@${d.name}\n`)
  }
})

universalOptions(
  program
    .command('eval <expression>')
    .description('evaluate a single expression against current environment')
).action((expression: string, opts: Record<string, string | undefined>) => {
    const evalOpts: import('./commands/eval.js').EvalOptions = {}
    if (opts['env']) evalOpts.env = opts['env']
    const result = runEval(expression, evalOpts)
    if (!opts['silent']) process.stdout.write(result.output + '\n')
  })

universalOptions(
  program
    .command('strip <file>')
    .description('strip LiveStage syntax, output clean markdown')
    .option('-o, --output <path>', 'write output to file')
).action((file: string, opts: Record<string, string | boolean | undefined>) => {
  const result = runStrip(file, opts)
  for (const warn of result.warnings) {
    if (!opts['silent']) process.stderr.write(`WARN: ${warn}\n`)
  }
  for (const err of result.errors) process.stderr.write(`ERROR: ${err}\n`)
  if (result.exitCode !== 0) process.exit(1)
  if (opts['output']) {
    const content = result.output.endsWith('\n') ? result.output : result.output + '\n'
    writeFileSync(String(opts['output']), content)
  } else {
    process.stdout.write(result.output.endsWith('\n') ? result.output : result.output + '\n')
  }
})

universalOptions(
  program
    .command('build <file>')
    .description('render and write output to file')
    .option('-o, --output <path>', 'output file path (required)')
).action((file: string, opts: Record<string, string | boolean | undefined>) => {
  const result = runBuild(file, opts)
  for (const warn of result.warnings) {
    if (!opts['silent']) process.stderr.write(`WARN: ${warn}\n`)
  }
  for (const err of result.errors) process.stderr.write(`ERROR: ${err}\n`)
  if (result.exitCode !== 0) process.exit(1)
  if (!opts['output'] && !opts['silent']) {
    process.stdout.write(result.output + '\n')
  }
})

universalOptions(
  program
    .command('watch <file>')
    .description('watch a file and re-render on change')
    .option('-o, --output <path>', 'write output to file on each change')
).action((file: string, opts: Record<string, string | boolean | undefined>) => {
  const watchOpts: import('./commands/watch.js').WatchOptions = {}
  if (opts['env']) watchOpts.env = String(opts['env'])
  if (opts['cwd']) watchOpts.cwd = String(opts['cwd'])
  if (opts['verbose']) watchOpts.verbose = true
  if (opts['strict']) watchOpts.strict = true
  if (opts['silent']) watchOpts.silent = true
  if (opts['output']) watchOpts.output = String(opts['output'])
  runWatch(file, watchOpts)
})

universalOptions(
  program
    .command('init')
    .description('install the LiveStage hook in your AI client config')
    .option('--client <type>', 'client type: claude-code, cursor (auto-detects if omitted)')
    .option('--global-claude-md', 'add LiveStage instructions to ~/.claude/CLAUDE.md')
    .option('--update', 'replace an existing LiveStage section with the current version')
).action((opts: Record<string, string | undefined>) => {
    const clientOpt = opts['client'] as import('./commands/init.js').ClientType | undefined
    const result = runInit(clientOpt ? { client: clientOpt } : {})
    if (result.alreadyInstalled) {
      process.stdout.write(`ℹ ${result.message}\n`)
    } else {
      process.stdout.write(`✓ ${result.message}\n`)
    }
    if (opts['globalClaudeMd'] || opts['update']) {
      const claudeMdResult = runInitClaudeMd({ update: !!opts['update'] })
      if (claudeMdResult.updated && claudeMdResult.alreadyPresent) {
        process.stdout.write('✓ LiveStage instructions updated in ' + claudeMdResult.claudeMdPath + '\n')
      } else if (claudeMdResult.alreadyPresent) {
        process.stdout.write('ℹ LiveStage instructions already in ' + claudeMdResult.claudeMdPath + ' (use --update to refresh)\n')
      } else if (claudeMdResult.updated) {
        process.stdout.write('✓ LiveStage instructions added to ' + claudeMdResult.claudeMdPath + '\n')
      }
    }
  })

const cache = program.command('cache').description('manage the LiveStage cache')

universalOptions(cache
  .command('show [file]')
  .description('list cache entries')
  .option('--session', 'show session cache only')
  .option('--persist', 'show persist cache only')
  .option('--expired', 'show only expired entries'))
  .action((_file: string | undefined, opts: Record<string, string | boolean | undefined>) => {
    const mode = opts['session'] ? 'session' as const : opts['persist'] ? 'persist' as const : undefined
    const showOpts: Parameters<typeof runCacheShow>[0] = {}
    if (mode !== undefined) showOpts.mode = mode
    if (opts['expired']) showOpts.expired = true
    if (opts['cwd']) showOpts.cwd = String(opts['cwd'])
    const result = runCacheShow(showOpts)
    if (result.entries.length === 0) {
      process.stdout.write('No cache entries\n')
    } else {
      for (const e of result.entries) {
        const expired = e.expired ? ' [EXPIRED]' : ''
        process.stdout.write(`${e.mode}  ${e.key.slice(0, 16)}...${expired}\n`)
      }
    }
  })

universalOptions(cache
  .command('clear [file]')
  .description('clear cache entries')
  .option('--session', 'clear session cache only')
  .option('--persist', 'clear persist cache only')
  .option('--directive <type>', 'clear only entries for this directive type'))
  .action((_file: string | undefined, opts: Record<string, string | boolean | undefined>) => {
    const clearOpts: Parameters<typeof runCacheClear>[0] = {
      session: Boolean(opts['session']),
      persist: Boolean(opts['persist']),
    }
    if (opts['directive']) clearOpts.directive = String(opts['directive'])
    if (opts['cwd']) clearOpts.cwd = String(opts['cwd'])
    const result = runCacheClear(clearOpts)
    const parts = []
    if (result.cleared.session) parts.push('session')
    if (result.cleared.persist) parts.push('persist')
    process.stdout.write(`✓ Cleared cache: ${parts.join(', ')}\n`)
  })

const engine = program.command('engine').description('inspect the render engine (trace, ...)')

universalOptions(engine
  .command('trace [render-id]')
  .description('read back trace records for the last render, or a specific render id')
  .option('--last', 'the most recent render (default when no render-id is given)'))
  .action((renderId: string | undefined, opts: Record<string, string | boolean | undefined>) => {
    const traceOpts: Parameters<typeof runEngineTrace>[0] = {}
    if (opts['cwd']) traceOpts.cwd = String(opts['cwd'])
    if (renderId) traceOpts.renderId = renderId
    else traceOpts.last = true
    const result = runEngineTrace(traceOpts)
    for (const err of result.errors) process.stderr.write(`ERROR: ${err}\n`)
    if (result.exitCode !== 0) process.exit(1)
    if (!opts['silent']) {
      for (const record of result.records) process.stdout.write(JSON.stringify(record) + '\n')
    }
  })

registerSecurity(program)

universalOptions(
  parser
    .command('macros <file>')
    .description('list all macros defined in the document')
).action((file: string, opts: Record<string, string | undefined>) => {
    const result = runListMacros(file, opts['cwd'] ? { cwd: opts['cwd'] } : {})
    for (const err of result.errors) process.stderr.write(`ERROR: ${err}\n`)
    if (result.exitCode !== 0) process.exit(1)
    if (!opts['silent']) {
      for (const m of result.macros) {
        const params = m.params.length > 0 ? `(${m.params.join(', ')})` : ''
        const local = m.local ? ' [local]' : ''
        process.stdout.write(`@define ${m.name}${params}${local} (line ${m.line})\n`)
      }
    }
  })

universalOptions(
  parser
    .command('imports <file>')
    .description('list all @include and @import dependencies')
).action((file: string, opts: Record<string, string | undefined>) => {
    const result = runListImports(file, opts['cwd'] ? { cwd: opts['cwd'] } : {})
    for (const err of result.errors) process.stderr.write(`ERROR: ${err}\n`)
    if (!opts['silent']) {
      for (const i of result.imports) {
        process.stdout.write(`@${i.type} ${i.path} (line ${i.line})\n`)
      }
    }
    if (result.exitCode !== 0) process.exit(1)
  })

const __dirname = dirname(fileURLToPath(import.meta.url))
// cli.ts lives one level under the package root's build output (src/cli/ or
// dist/cli/ depending on context), package.json is at the root: two levels
// up, not one. (The one-level version silently pointed at a nonexistent
// dist/package.json / src/package.json and crashed the CLI binary outright,
// found while verifying the hook's timeout path spawns this exact entry.)
const { version } = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as { version: string }
program.name('livestage').version(version).parse()
