import type { ASTNode } from 'livestage/parser'
import type { FilesystemSecurityConfig, ShellSecurityConfig, HttpSecurityConfig, DbSecurityConfig, EventSecurityConfig, CodeSecurityConfig } from './security/config.js'
import type { TraceConfig } from './trace/config.js'
import type { AssertResult } from './assert/operators.js'

export interface EventMeta {
  datetime: string
  line: number
  runId: string
  sessionId: string | null
  model: string | null
  tokenUsage: number | null
  git: { hash: string; short: string } | null
  callstack: string[]
}

export interface EngineEvent {
  name: string
  data: string
  transport: string
  document: string
  phase: string | null
  timestamp: number
  meta: EventMeta
}

export interface Connection {
  type: string
  args: Record<string, string>
}

export interface SecurityConfig {
  allowShell: boolean
  allowHttp: boolean
  allowDb: boolean
  // Legacy single jail (still consulted as fallback when sourceJail/dataJail unset).
  jailRoot: string | null
  // v2.0 split: source ops (@import/@include) and data ops (@list/@read/file.*)
  // jail to different roots. Engine.execute() resolves these from filesystem
  // config at start of render and stores absolute paths here.
  // Optional for back-compat — when unset, code falls back to jailRoot.
  sourceJail?: string | null           // dirname of entry document (default)
  dataJail?: string | null             // process cwd (default in v2.0)
  // Expanded allow-lists (post-${VAR} substitution). Optional for back-compat.
  allowedSourcePaths?: string[]
  allowedDataPaths?: string[]
  // Write directives (v2.0+): jail and allow-list resolved at execute() time.
  // writeJail set to the configured write_root (default: cwd) when write_enabled.
  // When undefined, write directives are blocked entirely.
  writeJail?: string | null
  allowedWritePaths?: string[]
  writeEnabled?: boolean
  filesystemConfig?: FilesystemSecurityConfig
  shellConfig?: ShellSecurityConfig
  httpConfig?: HttpSecurityConfig
  dbConfig?: DbSecurityConfig
  eventConfig?: EventSecurityConfig
  codeConfig?: CodeSecurityConfig
}

export interface MCPContext {
  sessionId: string
}

export interface SkillContext {
  args: string                        // $ARGUMENTS, full raw argument string
  argsList: string[]                  // $ARGUMENTS[N] / $N, parsed positional args
  namedArgs: Record<string, string>   // named args declared in skill frontmatter arguments:
  vars: Record<string, string>        // --var k=v / LIVESTAGE_VAR_*, {{ vars.k }} (F-ARGS, feature 23)
  sessionId: string                   // ${CLAUDE_SESSION_ID}
  effort: string                      // ${CLAUDE_EFFORT}
  skillDir: string                    // ${CLAUDE_SKILL_DIR}
}

export interface MacroDefinition {
  body: ASTNode[]
  params: string[]
}

export interface ConstraintEntry {
  id: string
  severity: string
  body: string
}

export interface EngineContext {
  env: Record<string, string>
  envFiles: Record<string, string>
  // Structured-value store for directives that produce object/array/boolean
  // results. Spread into the expression sandbox by buildSandbox(), so
  // {{ label.field.subfield }} navigates the struct directly. Keys here
  // shadow keys in envFiles when the same name is used, so directives
  // that want struct access (a structured source directive with label=)
  // store here while keeping the formatted text in envFiles for inline
  // rendering.
  data: Record<string, unknown>
  envFallbacks: Record<string, string>
  connections: Record<string, Connection>
  localConnectionNames: Set<string>
  macros: Record<string, MacroDefinition>
  phase: string | null
  cwd: string
  docDir: string
  security: SecurityConfig
  mcp: MCPContext | null
  warnings: string[]
  resolutionStack: Set<string>
  completedSet: Set<string>
  consumer: string | undefined
  glossary: Map<string, string>
  constraints: ConstraintEntry[]
  skillContext: SkillContext | null
  events: EngineEvent[]
  runId: string
  gitMeta: { hash: string; short: string } | null
  model: string | null
  tokenUsage: number | null
  callstack: string[]
  traceConfig: TraceConfig | null
  // The @on complete transition that fired during this execution, set when
  // the engine walks a transition node inside the currently-active phase
  // (ctx.phase). Stays null when no phase was scoped or when the active
  // phase had no transitions in the chosen @if branch. resolve_phase /
  // next_phase read this to advise Claude which phase to render next,
  // honoring conditional @if/@switch wrappers around @on complete.
  chosenTransition: ChosenTransition | null
  /**
   * When `"passthrough"`, the engine leaves `` !`...` `` shell-inline syntax
   * untouched in the rendered output and skips its security gate. Nothing
   * currently sets this to `"passthrough"`, no header directive exists;
   * real per-document opt-out awaits the frontmatter schema engine. Default
   * is `null` (intercept).
   */
  shellInline: 'passthrough' | null
  // Populated by the engine's 'assert' case as each @assert node executes,
  // so a caller (the `assert` CLI command, feature 28) can aggregate a
  // document's assertion results into an exit code without re-parsing
  // rendered markdown. Absent (undefined) unless the caller opts in by
  // passing an empty array in makeContext's overrides; render() itself
  // never reads this field.
  assertResults?: AssertResult[]
  // Frozen clock + seeded UUID source for LIVESTAGE_DETERMINISTIC=1 renders
  // (feature 35). null means "not deterministic", the default: every call
  // site falls back to real Date/crypto.randomUUID. Computed once per
  // execute() call from ctx.env, never mutated mid-render, so every {{ }}
  // and @date resolution in one render sees the same frozen `now` and the
  // same seeded uuid sequence a second identical render would produce.
  determinism: import('./determinism.js').DeterminismState | null
  // --timeout (feature 13, CLI Router): absolute Date.now() past which a
  // render aborts. null means no deadline, the default. Checked once per
  // node in walkNode, the single choke point every top-level node, foreach
  // iteration, and nested @include walk passes through, so a runaway loop
  // or deep include chain is caught without threading a check through each
  // of those call sites individually. Cooperative, not preemptive: a single
  // long-running node (an unbounded @query/@code) still needs its own
  // timeout, this only stops the NEXT node from starting once expired.
  deadline: number | null
  // Set once walkNode's deadline check trips, so execute()'s top-level loop
  // can stop after the current node instead of re-throwing (and re-logging)
  // the same timeout error for every remaining sibling.
  timedOut: boolean
}

export interface ChosenTransition {
  event: 'complete'
  phaseTarget: string
}

export function makeContext(overrides?: Partial<EngineContext>): EngineContext {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) env[k] = v
  }
  const cwd = process.cwd()
  const base: EngineContext = {
    env,
    envFiles: {},
    data: {},
    envFallbacks: {},
    connections: {},
    localConnectionNames: new Set<string>(),
    macros: {},
    phase: null,
    cwd,
    docDir: cwd,
    security: { allowShell: false, allowHttp: false, allowDb: false, jailRoot: cwd },
    mcp: null,
    warnings: [],
    resolutionStack: new Set<string>(),
    completedSet: new Set<string>(),
    consumer: undefined,
    glossary: new Map<string, string>(),
    constraints: [],
    skillContext: null,
    events: [],
    runId: '',
    gitMeta: null,
    model: null,
    tokenUsage: null,
    callstack: [],
    traceConfig: null,
    chosenTransition: null,
    shellInline: null,
    determinism: null,
    deadline: null,
    timedOut: false,
  }
  if (!overrides) return base
  const { warnings, resolutionStack, completedSet, localConnectionNames, glossary, constraints, events, callstack, ...rest } = overrides
  return {
    ...base,
    ...rest,
    warnings: warnings ?? base.warnings,
    resolutionStack: resolutionStack ?? base.resolutionStack,
    completedSet: completedSet ?? base.completedSet,
    localConnectionNames: localConnectionNames ?? base.localConnectionNames,
    glossary: glossary ?? base.glossary,
    constraints: constraints ?? base.constraints,
    events: events ?? base.events,
    callstack: callstack ?? base.callstack,
  }
}

export function resolveEnv(key: string, directiveFallback: string | null, ctx: EngineContext): string {
  return ctx.env[key]
    ?? ctx.envFiles[key]
    ?? ctx.envFallbacks[key]
    ?? directiveFallback
    ?? ''
}
