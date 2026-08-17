import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { trustDirectory, untrustDirectory, listTrustedDirectories } from 'livestage/engine'

export interface TrustOptions {
  dir?: string
  cwd?: string
  homeDir?: string
  list?: boolean
  remove?: boolean
}

export interface TrustResult {
  action: 'trusted' | 'already-trusted' | 'untrusted' | 'not-trusted' | 'list'
  path?: string
  entries?: string[]
  message: string
}

/**
 * `livestage trust [dir]`: records a project directory as trusted
 * (~/.livestage/trust.json, see security/trust.ts), the workspace-trust
 * mechanism a `.livestage/policy.json` that arrived via a clone needs
 * before its grants (shell, @code, http) take effect, mirroring Claude
 * Code's own trust dialog for a project-level settings.json
 * permissions.allow block. Defaults to the current directory, matching
 * the shape of `livestage init` itself (no args, acts on cwd).
 */
export function runTrust(options: TrustOptions = {}): TrustResult {
  const home = options.homeDir ?? homedir()
  const cwd = options.cwd ?? process.cwd()
  const dir = resolve(cwd, options.dir ?? '.')

  if (options.list) {
    const entries = listTrustedDirectories(home)
    return {
      action: 'list',
      entries,
      message: entries.length > 0 ? entries.join('\n') : 'No trusted directories.',
    }
  }

  if (options.remove) {
    const result = untrustDirectory(dir, home)
    return result.removed
      ? { action: 'untrusted', path: result.path, message: `Untrusted: ${result.path}` }
      : { action: 'not-trusted', path: result.path, message: `${result.path} was not trusted.` }
  }

  const result = trustDirectory(dir, home)
  return result.added
    ? { action: 'trusted', path: result.path, message: `Trusted: ${result.path}` }
    : { action: 'already-trusted', path: result.path, message: `${result.path} is already trusted.` }
}
