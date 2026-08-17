import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export interface ShellSecurityConfig {
  enabled: boolean
  allow_patterns: string[]
  deny_patterns: string[]
  allow_network: boolean
  require_confirmation: boolean
  audit_log: boolean
}

export interface HttpSecurityConfig {
  enabled: boolean
  allowed_domains: string[]
  denied_domains: string[]
  allowed_methods: string[]
  max_response_size: number
  timeout: number
}

export interface DbConnectionSecurityConfig {
  allowed_operations: string[]
  denied_operations: string[]
  denied_keywords: string[]
  allowed_collections: string[]
  denied_collections: string[]
  allow_raw: boolean
  readonly: boolean
  max_results: number
}

export type DbSecurityConfig = Record<string, DbConnectionSecurityConfig>

export interface FilesystemSecurityConfig {
  // Path-jail roots (v2.0+):
  //   source_root: where @import / @include resolve from
  //     "auto"          → dirname of the entry document (recommended default)
  //     "cwd"           → process working directory
  //     <absolute path> → pin to a specific directory
  //   data_root: where @list / @read / @tree / @count / @date file= / file.*
  //              and other data operations resolve from
  //     "cwd"           → process working directory (recommended for skill mode)
  //     "auto"          → dirname of entry document (recommended for plain CLI)
  //     <absolute path> → pin to a specific directory
  // Both default to "auto" when unset. The CLI's `mai render` keeps "auto" for
  // backward-compatible behavior. MCP read_file / skill mode passes "cwd" so a
  // skill can see the user's project.
  source_root?: string
  data_root?: string
  // Additional whitelisted paths beyond the corresponding root. Glob patterns
  // accepted. Variable expansion supported: ${HOME}, ${CLAUDE_SKILL_DIR}, and
  // any process env var, evaluated at check time.
  allowed_source_paths: string[]
  allowed_data_paths: string[]
  // Write directives (@mkdir, @copy, @append-if-missing) — disabled by default.
  // When enabled, writes may happen inside write_root and any allowed_write_paths.
  // Built-in always-block list (.env, credentials, .ssh, .git, etc.) is immutable.
  write_enabled?: boolean
  write_root?: string                // "cwd" | "auto" | absolute path; default "cwd"
  allowed_write_paths?: string[]
  // Pre-existing fields (apply to all filesystem ops):
  additional_block_paths: string[]
  additional_block_patterns: string[]
  allow_unmasked_paths: string[]
  allow_unmasked_patterns: string[]
  user_masking_patterns: string[]
}

export interface CodeSecurityConfig {
  languages: string[]                    // e.g. ["python", "javascript"], empty = @code entirely off
  timeout: number                        // ms
  runners: Record<string, string>        // language -> command, extends/overrides the built-in map
}

export interface EventTransportConfig {
  type: 'http' | 'file' | 'db'
  url?: string
  headers?: Record<string, string>
  path?: string
  connection?: string
  collection?: string
}

export interface EventSecurityConfig {
  allowed_transports: string[]
  allow_env_interpolation: boolean
  max_value_length: number
  onError: 'silence' | 'warn' | 'fail'
  transports?: Record<string, EventTransportConfig>
}

export interface SecurityJsonConfig {
  shell: ShellSecurityConfig
  http: HttpSecurityConfig
  db: DbSecurityConfig
  filesystem: FilesystemSecurityConfig
  event: EventSecurityConfig
  code: CodeSecurityConfig
}

export function defaultSecurityConfig(): SecurityJsonConfig {
  return {
    shell: {
      // Enabled by default with a curated allowlist of read-only commands
      // commonly used by flow files (git introspection, file/system reads,
      // text processing). The immutable always-block list (SHELL_ALWAYS_BLOCK
      // in rules.ts) still applies — destructive commands like rm/dd/mkfs
      // and code execution like `node -e`/`eval` are unconditionally blocked
      // regardless of allowlist. Users who want a stricter default can drop
      // `.livestage/policy.json` (project root) with their own
      // shell.allow_patterns.
      enabled: true,
      allow_patterns: [
        'git *',                          // branch, log, status, diff, rev-parse, config, show, etc.
        'cat *',                          // read text files
        'head *', 'tail *', 'wc *',       // text processing
        'grep *', 'sort *', 'uniq *',
        'find *',
        'ls', 'ls *',
        'pwd',
        'whoami', 'id',
        'hostname',
        'which *',
        'echo *',
        'date', 'date *',
        'test *',                         // POSIX file tests
        // Test runners and build tools — flow files use @test and @check to
        // run these via the engine's allowlisted shell. The runners are
        // read-only (they execute the test suite, exit code is the signal)
        // and standard in any JS/TS project.
        'npx vitest*', 'npx jest*', 'npx playwright*',
        // @test/@check auto-detection (exec-ops.ts's detectCommand) always
        // shells out via `npm run <script>` regardless of the project's
        // actual package manager, so the npm forms below are load-bearing
        // even in a pnpm/yarn project, not just an npm one.
        'npm test*', 'npm run test*',
        'npm run typecheck*', 'npm run lint*', 'npm run build*',
        'pnpm test*', 'pnpm run test*', 'pnpm vitest*', 'pnpm exec vitest*',
        'pnpm typecheck*', 'pnpm run typecheck*',
        'pnpm lint*', 'pnpm run lint*',
        'pnpm build*', 'pnpm run build*',
        'pnpm tsc*', 'npx tsc*', 'tsc', 'tsc *',
        'node --test*',
        'vitest*',
      ],
      deny_patterns: [],
      allow_network: false,
      require_confirmation: false,
      audit_log: true,
    },
    http: {
      enabled: false,
      allowed_domains: [],
      denied_domains: [],
      allowed_methods: ['GET'],
      max_response_size: 1_048_576,
      timeout: 10_000,
    },
    db: {},
    filesystem: {
      allowed_source_paths: [],
      allowed_data_paths: [],
      additional_block_paths: [],
      additional_block_patterns: [],
      allow_unmasked_paths: [],
      allow_unmasked_patterns: [],
      user_masking_patterns: [],
      // source_root and data_root deliberately left unset — callers (CLI vs MCP)
      // pick the right default per mode.
    },
    event: {
      allowed_transports: [],
      allow_env_interpolation: false,
      max_value_length: 500,
      onError: 'silence',
    },
    // OFF in every profile until the project policy explicitly grants
    // languages (CR-5 business rule 4, feature 29).
    code: {
      languages: [],
      timeout: 30_000,
      runners: {},
    },
  }
}

// The actual "strict" profile: CR-5 business rule 1 promises deny-by-default,
// but defaultSecurityConfig() above ships shell ENABLED with a ~40-pattern
// wildcard allowlist (git *, cat *, grep *, ...), because it also has to
// serve as the fallback for a project with no policy file at all, where
// @query/@test/@check need to work out of the box. `init` used to seed that
// same permissive config verbatim while its own comment claimed it was
// seeding "the strict profile" - a real gap between what shipped and what
// was documented, since every fresh `livestage init` silently granted ~40
// shell patterns nobody reviewed. strictSecurityConfig() is what "strict"
// actually means: shell off, no patterns granted, everything else matching
// defaultSecurityConfig()'s already-deny-by-default posture (@code and http
// stay off in both profiles). `init` seeds THIS now; defaultSecurityConfig()
// remains the fallback for a missing/unreadable policy file everywhere else.
export function strictSecurityConfig(): SecurityJsonConfig {
  const defaults = defaultSecurityConfig()
  return {
    ...defaults,
    shell: {
      ...defaults.shell,
      enabled: false,
      allow_patterns: [],
    },
  }
}

export function loadSecurityConfig(filePath?: string, cwd?: string): SecurityJsonConfig {
  const path = filePath ?? join(cwd ?? process.cwd(), '.livestage', 'policy.json')
  let raw: string
  try { raw = readFileSync(path, 'utf8') } catch { return defaultSecurityConfig() }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      process.stderr.write(`[livestage] security config invalid (${path}): expected object\n`)
      return defaultSecurityConfig()
    }
    const loaded = parsed as Record<string, unknown>
    const defaults = defaultSecurityConfig()
    return {
      shell: { ...defaults.shell, ...(typeof loaded['shell'] === 'object' && loaded['shell'] !== null && !Array.isArray(loaded['shell']) ? loaded['shell'] as Partial<ShellSecurityConfig> : {}) },
      http: { ...defaults.http, ...(typeof loaded['http'] === 'object' && loaded['http'] !== null && !Array.isArray(loaded['http']) ? loaded['http'] as Partial<HttpSecurityConfig> : {}) },
      db: (typeof loaded['db'] === 'object' && loaded['db'] !== null && !Array.isArray(loaded['db']) ? loaded['db'] as DbSecurityConfig : {}),
      filesystem: { ...defaults.filesystem, ...(typeof loaded['filesystem'] === 'object' && loaded['filesystem'] !== null && !Array.isArray(loaded['filesystem']) ? loaded['filesystem'] as Partial<FilesystemSecurityConfig> : {}) },
      event: { ...defaults.event, ...(typeof loaded['event'] === 'object' && loaded['event'] !== null && !Array.isArray(loaded['event']) ? loaded['event'] as Partial<EventSecurityConfig> : {}) },
      code: { ...defaults.code, ...(typeof loaded['code'] === 'object' && loaded['code'] !== null && !Array.isArray(loaded['code']) ? loaded['code'] as Partial<CodeSecurityConfig> : {}) },
    }
  } catch (err) {
    process.stderr.write(`[livestage] security config parse error (${path}): ${String(err)}\n`)
    return defaultSecurityConfig()
  }
}
