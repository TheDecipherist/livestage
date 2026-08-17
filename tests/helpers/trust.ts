import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { trustDirectory } from '../../src/engine/security/trust.js'

/**
 * Workspace trust ("inherit the user's Claude Code permissions"): a real
 * policy.json's shell/code/http grants now require the directory it
 * governs to be explicitly trusted first (loadSecurityConfig,
 * src/engine/security/config.ts). Every e2e test that renders a
 * committed example directory with its own .livestage/policy.json needs
 * to trust that directory before its grants apply, the same way a real
 * user would run `livestage trust` once after cloning.
 *
 * Uses an isolated, throwaway home directory rather than the real
 * developer machine's ~/.livestage/trust.json, so running the suite never
 * touches a real trust store. Pass the resulting homeDir to loadSecurityConfig
 * / runRender's homeDir option, or as --home-dir to a spawned CLI process.
 */
export function setupTrustedHome(...dirsToTrust: string[]): { homeDir: string; cleanup: () => void } {
  const homeDir = mkdtempSync(join(tmpdir(), 'ls-trust-'))
  for (const dir of dirsToTrust) trustDirectory(dir, homeDir)
  return { homeDir, cleanup: () => rmSync(homeDir, { recursive: true, force: true }) }
}
