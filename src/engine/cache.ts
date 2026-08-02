import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, statSync } from 'node:fs'
import { join, resolve, isAbsolute } from 'node:path'
import type { CacheConfig } from 'livestage/parser'
import { applyMasking } from './security/masking.js'
import { checkFilePath } from './security/filesystem.js'
import type { FilesystemSecurityConfig } from './security/config.js'

interface PersistEntry {
  value: string
  expires: number
  directive?: string
}

const SESSION_CACHE = new Map<string, string>()
// Config home is `.livestage/` in the project root (policy.json, schemas/,
// cache/, trace/), not the user's home directory. A function, not a frozen
// module-level constant: --cwd is threaded as a value everywhere else in
// this codebase (render.ts never calls process.chdir()), so a constant
// computed once from process.cwd() at import time silently ignores --cwd.
// This was a real bug: `cache show/clear --cwd <path>` accepted the flag
// and did nothing with it.
function cacheDir(cwd?: string): string {
  return join(cwd ?? process.cwd(), '.livestage', 'cache')
}

export function cacheKey(directiveType: string, options: Record<string, unknown>): string {
  const sorted = Object.fromEntries(
    Object.entries(options).sort(([a], [b]) => a.localeCompare(b))
  )
  return createHash('sha256')
    .update(directiveType + ':' + JSON.stringify(sorted))
    .digest('hex')
}

export function readCache(key: string, config: CacheConfig, docRoot?: string, cwd?: string): string | null {
  if (config.mode === 'mock') {
    if (!config.mockPath) return null
    // checkFilePath validates the path resolved against docRoot; the actual
    // read must use that same resolved path, not the raw mockPath string
    // (which readFileSync would otherwise resolve against process.cwd(),
    // silently missing every realistic relative mock= path).
    const resolvedPath = docRoot && !isAbsolute(config.mockPath)
      ? resolve(docRoot, config.mockPath)
      : config.mockPath
    if (docRoot) {
      const check = checkFilePath(config.mockPath, docRoot)
      if (check.level === 'blocked') return null
    }
    try { return readFileSync(resolvedPath, 'utf8') } catch { return null }
  }
  if (config.mode === 'session') return SESSION_CACHE.get(key) ?? null
  if (config.mode === 'persist') {
    const path = join(cacheDir(cwd), key + '.json')
    if (!existsSync(path)) return null
    try {
      const entry = JSON.parse(readFileSync(path, 'utf8')) as PersistEntry
      if (Date.now() > entry.expires) return null
      return entry.value
    } catch { return null }
  }
  return null
}

export function writeCache(
  key: string,
  value: string,
  config: CacheConfig,
  securityConfig?: FilesystemSecurityConfig,
  directiveType?: string,
  cwd?: string
): void {
  const { masked } = applyMasking(value, securityConfig)
  if (config.mode === 'session') {
    SESSION_CACHE.set(key, masked)
  } else if (config.mode === 'persist') {
    const ttlMs = (config.ttl ?? 3600) * 1000
    const dir = cacheDir(cwd)
    mkdirSync(dir, { recursive: true })
    const entry: PersistEntry = { value: masked, expires: Date.now() + ttlMs }
    if (directiveType) entry.directive = directiveType
    writeFileSync(join(dir, key + '.json'), JSON.stringify(entry))
  }
}

export function clearSessionCache(): void {
  SESSION_CACHE.clear()
}

export function clearPersistCache(directiveType?: string, cwd?: string): void {
  try {
    const dir = cacheDir(cwd)
    const files = readdirSync(dir)
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const path = join(dir, file)
      if (directiveType) {
        try {
          const entry = JSON.parse(readFileSync(path, 'utf8')) as { directive?: string }
          if (entry.directive !== directiveType) continue
        } catch { continue }
      }
      try { unlinkSync(path) } catch (err) {
        process.stderr.write(`[livestage] cache: failed to delete ${path}: ${String(err)}\n`)
      }
    }
  } catch { /* cache dir may not exist, not an error */ }
}

export interface CacheEntry {
  key: string
  mode: 'session' | 'persist'
  expired?: boolean
  size?: number
}

export function showCacheEntries(mode?: 'session' | 'persist', cwd?: string): CacheEntry[] {
  const entries: CacheEntry[] = []
  if (!mode || mode === 'session') {
    for (const key of SESSION_CACHE.keys()) {
      entries.push({ key, mode: 'session' })
    }
  }
  if (!mode || mode === 'persist') {
    try {
      const dir = cacheDir(cwd)
      const files = readdirSync(dir)
      for (const file of files) {
        if (!file.endsWith('.json')) continue
        const path = join(dir, file)
        try {
          const raw = readFileSync(path, 'utf8')
          const entry = JSON.parse(raw) as PersistEntry
          const expired = Date.now() > entry.expires
          const size = statSync(path).size
          entries.push({ key: file.replace('.json', ''), mode: 'persist', expired, size })
        } catch { /* skip malformed cache entry */ }
      }
    } catch { /* cache dir may not exist, not an error */ }
  }
  return entries
}
