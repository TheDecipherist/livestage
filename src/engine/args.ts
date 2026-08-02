// F-ARGS: --args "<raw prompt>" --var k=v CLI input, exposed to a render as
// {{ args }}, tokenized {{ arg0 }}..{{ arg3 }} (existing skill-context-
// variables machinery, see context.ts's SkillContext), and a new {{ vars.k }}
// namespace. Env mirrors (LIVESTAGE_ARGS, LIVESTAGE_VAR_*) and the
// LIVESTAGE_CONTEXT JSON blob for @code (feature 29, not yet built) live
// here too.

const VAR_ENV_PREFIX = 'LIVESTAGE_VAR_'

// Quote-aware split, same shape as buildSkillContext's inline tokenizer in
// cli/commands/render.ts (kept here so both --args and --skill-args paths
// can share one implementation instead of drifting).
export function tokenizeArgs(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed) return []
  return [...trimmed.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '')
}

// --var is a repeatable CLI option; each entry is a raw "k=v" string.
export function parseVarFlags(pairs: string[]): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const pair of pairs) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const key = pair.slice(0, eq).trim()
    if (!key) continue
    vars[key] = pair.slice(eq + 1)
  }
  return vars
}

export function varsFromEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && k.startsWith(VAR_ENV_PREFIX)) {
      vars[k.slice(VAR_ENV_PREFIX.length)] = v
    }
  }
  return vars
}

export interface ArgsInput {
  args?: string
  varFlags?: string[]
  env?: NodeJS.ProcessEnv
}

export interface ArgsContext {
  args: string
  argsList: string[]
  vars: Record<string, string>
}

// Passive (hook) renders carry no arguments at all: args defaults to '',
// argsList to [], vars to {}, so a document that dereferences {{ args }} or
// {{ vars.x }} with no fallback still renders (empty string / undefined)
// rather than throwing.
export function buildArgsContext(input: ArgsInput = {}): ArgsContext {
  const env = input.env ?? process.env
  const args = input.args ?? env['LIVESTAGE_ARGS'] ?? ''
  // CLI --var flags win over the LIVESTAGE_VAR_* env mirror on conflict.
  const vars = { ...varsFromEnv(env), ...parseVarFlags(input.varFlags ?? []) }
  return { args, argsList: tokenizeArgs(args), vars }
}

// Env mirror: LIVESTAGE_ARGS / LIVESTAGE_VAR_<NAME> readable via @env the
// same way any other env var is, in addition to the {{ args }}/{{ vars.k }}
// template bindings.
export function argsEnvMirror(ctx: ArgsContext): Record<string, string> {
  const mirror: Record<string, string> = {}
  if (ctx.args) mirror['LIVESTAGE_ARGS'] = ctx.args
  for (const [k, v] of Object.entries(ctx.vars)) {
    mirror[`${VAR_ENV_PREFIX}${k}`] = v
  }
  return mirror
}

// The data model @code (feature 29) reads via LIVESTAGE_CONTEXT: the same
// args/vars, plus the tokenized list under `argN` and the document path.
export function buildLiveStageContextJson(ctx: ArgsContext, doc: string): string {
  return JSON.stringify({ args: ctx.args, argN: ctx.argsList, vars: ctx.vars, doc })
}
