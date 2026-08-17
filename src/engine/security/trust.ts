// Workspace trust for LiveStage's own policy.json, mirroring Claude Code's
// own trust dialog for a project-level settings.json permissions.allow
// block. A cloned repo can ship a permissive `.livestage/policy.json`
// alongside a `.stage` file that reads on the very next Read tool call
// (the hook spawns its render with `--cwd dirname(filePath)`), so a
// project's grants (shell.enabled, shell.allow_patterns, code.languages,
// http.enabled) only take effect once its directory has been explicitly
// trusted, one time, via `livestage trust <dir>`. Denies, the immutable
// always-block rules, and everything else that only restricts are
// unaffected: trust gates GRANTS, never restrictions.
//
// RESOLVED (2026-08-17): now wired into loadSecurityConfig's own default
// call path (src/engine/security/config.ts). Every one of its four real
// production call sites (render.ts, validate.ts, doctor.ts, security.ts)
// is covered: loadSecurityConfig's new optional homeDir parameter
// defaults to the real os.homedir() when unset, so every existing call
// site is trust-gated with no signature change forced on it, and
// render.ts additionally exposes --home-dir on the CLI itself (and
// renderViaCli in the hook) for tests and automation to isolate trust
// state without touching a real developer machine's real
// ~/.livestage/trust.json. Also wired into checkShellCommandWithSettings's
// caller in sources.ts's executeQuery, per the earlier session's
// proof-of-integration work.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export interface TrustStore {
  trusted: string[]
}

function trustStorePath(homeDir: string): string {
  return join(homeDir, '.livestage', 'trust.json')
}

function readTrustStore(homeDir: string): TrustStore {
  const path = trustStorePath(homeDir)
  if (!existsSync(path)) return { trusted: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { trusted?: unknown }
    const trusted = Array.isArray(parsed.trusted) ? parsed.trusted.filter((p): p is string => typeof p === 'string') : []
    return { trusted }
  } catch {
    return { trusted: [] }
  }
}

function writeTrustStore(homeDir: string, store: TrustStore): void {
  const path = trustStorePath(homeDir)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store, null, 2) + '\n', 'utf8')
}

export function isTrusted(dir: string, homeDir: string): boolean {
  return readTrustStore(homeDir).trusted.includes(resolve(dir))
}

export function trustDirectory(dir: string, homeDir: string): { added: boolean; path: string } {
  const resolved = resolve(dir)
  const store = readTrustStore(homeDir)
  if (store.trusted.includes(resolved)) return { added: false, path: resolved }
  store.trusted.push(resolved)
  writeTrustStore(homeDir, store)
  return { added: true, path: resolved }
}

export function untrustDirectory(dir: string, homeDir: string): { removed: boolean; path: string } {
  const resolved = resolve(dir)
  const store = readTrustStore(homeDir)
  const idx = store.trusted.indexOf(resolved)
  if (idx === -1) return { removed: false, path: resolved }
  store.trusted.splice(idx, 1)
  writeTrustStore(homeDir, store)
  return { removed: true, path: resolved }
}

export function listTrustedDirectories(homeDir: string): string[] {
  return readTrustStore(homeDir).trusted
}
