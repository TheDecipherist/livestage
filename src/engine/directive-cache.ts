import type { CacheConfig } from 'livestage/parser'
import type { EngineContext } from './context.js'
import { cacheKey, readCache, writeCache } from './cache.js'

// Wraps a source directive's already-security-checked compute step in
// session/persist caching. Mock mode is handled inline by each directive
// (it substitutes a fixture, not a prior real result, so there is nothing
// here for it to do). Callers must run path/shell resolution and security
// checks BEFORE calling this, then pass only the safe-to-run work as
// `compute`: a cache hit skips `compute` entirely, so anything a security
// check would have blocked must already have returned by the time this
// runs, never be checked inside it.
export function withDirectiveCache(
  directiveType: string,
  cache: CacheConfig | null,
  keyOptions: Record<string, unknown>,
  ctx: EngineContext,
  compute: () => string[],
): string[] {
  if (!cache || cache.mode === 'mock') return compute()
  const key = cacheKey(directiveType, keyOptions)
  const cached = readCache(key, cache, ctx.docDir, ctx.cwd)
  if (cached !== null) return cached === '' ? [] : cached.split('\n')
  const result = compute()
  writeCache(key, result.join('\n'), cache, ctx.security.filesystemConfig, directiveType, ctx.cwd)
  return result
}
