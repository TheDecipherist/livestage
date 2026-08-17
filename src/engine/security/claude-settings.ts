// Inherits Claude Code's own permissions.{allow,deny,ask} settings (the
// same "Tool(specifier)" rules a user maintains in
// ~/.claude/settings.json / <project>/.claude/settings.json / .local.json)
// into LiveStage's shell security decisions, instead of the two lists
// (Claude Code's and .livestage/policy.json's) drifting apart as separate,
// hand-maintained sources of truth for the same intent.
//
// The direction rule, and it is the whole design: inherit deny and ask
// ALWAYS (they only restrict, no trust step needed); never auto-inherit
// allow at render time. An allow rule in Claude Code was granted for an
// interactive context where a human is present and a prompt can appear; a
// `.stage` render is automatic and unsupervised, so treating an allow rule
// there as an automatic grant here would be a privilege escalation. `ask`
// is treated as deny for the same reason: there is nobody to ask during an
// unsupervised render.
//
// Effective permission = livestage policy (checkShellCommand) narrowed by
// settings.allow, never widened by it: a command livestage's own policy
// already grants can additionally be narrowed away if Claude Code's
// settings carry Bash allow rules that don't cover it. If settings has NO
// Bash allow rules at all (the common case: most users rely on interactive
// prompts rather than pre-authorizing commands), that is settings
// expressing no opinion, not settings expressing "deny everything" -
// livestage's own policy.json governs alone in that case. A literal
// "intersect with the empty set" reading would make @query/@test/@check
// dead-on-arrival for almost every real user, including this project's own
// dogfood environment (confirmed: no `permissions` block at all in the
// live settings.json this session runs under).
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ShellSecurityConfig } from './config.js'
import { checkShellCommand, type ShellCheckResult } from './shell.js'
import { matchShellPattern, splitCompoundCommand } from './rules.js'

export interface PermissionRule {
  raw: string
  tool: string
  specifier?: string
}

// Parses a Claude Code permission rule string: "Bash" (bare tool, matches
// any invocation), or "Bash(npm run test *)" (tool + specifier). "Bash(ls:*)"
// is equivalent to "Bash(ls *)" per Claude Code's own documented shorthand.
export function parsePermissionRule(raw: string): PermissionRule {
  const m = raw.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/)
  if (!m) return { raw, tool: raw.trim() }
  const tool = m[1]!
  const specifier = m[2]!.replace(/:\*\s*$/, ' *')
  return { raw, tool, specifier }
}

function specifierMatchesCommand(specifier: string | undefined, command: string): boolean {
  // A bare tool name with no specifier ("Bash") matches any invocation of
  // that tool. matchShellPattern already gives '*' the word-boundary
  // property Claude Code documents (a literal space must appear in the
  // pattern for the wildcard to "continue" past a word: 'ls *' matches
  // 'ls -la' but not 'lsof', since there is no space in 'lsof').
  if (specifier === undefined) return true
  return matchShellPattern(specifier, command)
}

export interface ClaudeSettingsPermissions {
  allow: string[]
  deny: string[]
  ask: string[]
}

function emptyPermissions(): ClaudeSettingsPermissions {
  return { allow: [], deny: [], ask: [] }
}

export type SettingsScopeLabel = 'managed' | 'project-local' | 'project-shared' | 'user'

export interface SettingsScope {
  label: SettingsScopeLabel
  path: string
  permissions: ClaudeSettingsPermissions
}

// Best-effort, unverified against a live enterprise deployment (this
// project has no way to test one): the conventional per-OS location
// Claude Code documents for an organization-managed settings file, which
// this module reads if present and otherwise silently skips, same as any
// other missing scope. Override via readClaudeSettingsScopes's
// managedPath option (also how tests inject a fake one).
export const MANAGED_SETTINGS_PATH_BY_PLATFORM: Readonly<Record<string, string>> = Object.freeze({
  darwin: '/Library/Application Support/ClaudeCode/managed-settings.json',
  linux: '/etc/claude-code/managed-settings.json',
  win32: 'C:\\ProgramData\\ClaudeCode\\managed-settings.json',
})

function readPermissionsFile(path: string): ClaudeSettingsPermissions | null {
  if (!existsSync(path)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const permissionsField = (parsed as Record<string, unknown>)['permissions']
  if (typeof permissionsField !== 'object' || permissionsField === null) return emptyPermissions()
  const rec = permissionsField as Record<string, unknown>
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  return { allow: strings(rec['allow']), deny: strings(rec['deny']), ask: strings(rec['ask']) }
}

// Reads every scope that exists, highest precedence first: managed ->
// <cwd>/.claude/settings.local.json -> <cwd>/.claude/settings.json ->
// <homeDir>/.claude/settings.json. Precedence only matters for a future
// override-style consumer; mergeScopePermissions below merges rather than
// overrides, per Claude Code's own documented behavior ("deny from any
// scope beats allow from any scope").
export function readClaudeSettingsScopes(opts: { cwd: string; homeDir: string; managedPath?: string }): SettingsScope[] {
  const managedPath = opts.managedPath ?? MANAGED_SETTINGS_PATH_BY_PLATFORM[process.platform]
  const candidates: Array<[SettingsScopeLabel, string | undefined]> = [
    ['managed', managedPath],
    ['project-local', join(opts.cwd, '.claude', 'settings.local.json')],
    ['project-shared', join(opts.cwd, '.claude', 'settings.json')],
    ['user', join(opts.homeDir, '.claude', 'settings.json')],
  ]
  const scopes: SettingsScope[] = []
  for (const [label, path] of candidates) {
    if (!path) continue
    const permissions = readPermissionsFile(path)
    if (permissions) scopes.push({ label, path, permissions })
  }
  return scopes
}

export function mergeScopePermissions(scopes: SettingsScope[]): ClaudeSettingsPermissions {
  const merged = emptyPermissions()
  for (const scope of scopes) {
    merged.allow.push(...scope.permissions.allow)
    merged.deny.push(...scope.permissions.deny)
    merged.ask.push(...scope.permissions.ask)
  }
  return merged
}

function bashRuleMatches(command: string, rules: string[]): PermissionRule | null {
  for (const raw of rules) {
    const rule = parsePermissionRule(raw)
    if (rule.tool !== 'Bash') continue
    if (specifierMatchesCommand(rule.specifier, command)) return rule
  }
  return null
}

/**
 * The composed check: livestage's own policy (checkShellCommand,
 * itself already compound-command-safe) plus Claude Code's inherited
 * deny/ask (always applied) and allow (applied only as a narrowing
 * intersection, and only when settings actually expresses an opinion by
 * carrying at least one Bash allow rule). Splits the command the same
 * way checkShellCommand does, so a chain is evaluated per subcommand
 * against BOTH sources together, not evaluated separately and combined at
 * the end (a chain where subcommand 1 is settings-denied must fail even
 * if subcommand 2 would otherwise be fine).
 */
export function checkShellCommandWithSettings(
  command: string,
  livestageConfig: ShellSecurityConfig,
  settings: ClaudeSettingsPermissions,
): ShellCheckResult {
  const subcommands = splitCompoundCommand(command.trim())
  const hasBashAllowRules = settings.allow.some(r => parsePermissionRule(r).tool === 'Bash')

  for (const sub of subcommands) {
    const denyRule = bashRuleMatches(sub, settings.deny)
    if (denyRule) {
      return { allowed: false, tier: 'deny_pattern', reason: `Denied by Claude Code settings (permissions.deny: "${denyRule.raw}") for "${sub}"` }
    }
    const askRule = bashRuleMatches(sub, settings.ask)
    if (askRule) {
      return { allowed: false, tier: 'deny_pattern', reason: `Requires confirmation in Claude Code settings (permissions.ask: "${askRule.raw}") for "${sub}"; no one to ask during an unsupervised render` }
    }
    const base = checkShellCommand(sub, livestageConfig)
    if (!base.allowed) return base
    if (hasBashAllowRules && !bashRuleMatches(sub, settings.allow)) {
      return {
        allowed: false,
        tier: 'not_allowed',
        reason: `Allowed by livestage policy but not covered by any Claude Code settings Bash allow rule for "${sub}" (settings can only narrow, never widen, what livestage's own policy already granted)`,
      }
    }
  }
  return { allowed: true, tier: 'allowed', reason: 'In allowlist' }
}

/**
 * `init`'s seed-from-permissions helper (point 3 of the feature): turns
 * Claude Code's settings.allow Bash rules into a suggested
 * shell.allow_patterns list, so a user reviewing and confirming it gets a
 * policy narrower than, and less effort than, defaultSecurityConfig()'s
 * ~44-pattern default or hand-authoring one from scratch. Deliberately
 * ignores non-Bash tool rules (Read/Write/etc.), livestage's own policy has
 * no equivalent surface for those. Returns patterns in Tool(specifier)
 * form when they arrived that way (the format livestage's shell config
 * accepts, see checkShellCommand's matchShellPattern/matchGlob, both of
 * which operate on the bare specifier text either way since Tool(...) is
 * stripped by parsePermissionRule before matching).
 */
export function deriveShellAllowPatternsFromSettings(settings: ClaudeSettingsPermissions): string[] {
  const seen = new Set<string>()
  const patterns: string[] = []
  for (const raw of settings.allow) {
    const rule = parsePermissionRule(raw)
    if (rule.tool !== 'Bash' || rule.specifier === undefined) continue
    if (seen.has(rule.specifier)) continue
    seen.add(rule.specifier)
    patterns.push(rule.specifier)
  }
  return patterns
}
