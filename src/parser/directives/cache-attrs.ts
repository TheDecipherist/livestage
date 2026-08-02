import type { CacheConfig } from '../types.js'

// Shared by every source-shaped directive that can carry a CacheConfig
// (list, read, tree, query, code, include). `mock="path"` wins over
// `cache=` when both are given, matching the convention @query/@code
// already shipped in wave 5: a plain key=value attribute on the
// directive's own opener line, not the donor's dead multi-token @cache
// sub-syntax (see feature 21/35 known_issues).
export function parseCacheAttrs(attrs: Record<string, string>): CacheConfig | null {
  const mockPath = attrs['mock']
  if (mockPath) return { mode: 'mock', mockPath }

  const mode = attrs['cache']
  if (mode === 'session') return { mode: 'session' }
  if (mode === 'persist') {
    const ttlRaw = attrs['ttl']
    const ttl = ttlRaw !== undefined ? parseInt(ttlRaw, 10) : NaN
    return isNaN(ttl) ? { mode: 'persist' } : { mode: 'persist', ttl }
  }
  return null
}
