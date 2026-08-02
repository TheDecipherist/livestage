// Determinism (feature 35): LIVESTAGE_DETERMINISTIC=1 freezes the clock at
// LIVESTAGE_NOW and seeds UUID generation from LIVESTAGE_SEED, so two
// renders of the same document produce byte-identical output. This is what
// makes golden-file snapshot testing viable across the whole render surface
// (CR-6's fallback fixtures, the pattern-example demo, feature 21's mock
// cache), since wall-clock time and random UUIDs are otherwise the only
// sources of variance in an already-pure render.

export interface DeterminismState {
  now: Date
  nextUuid: () => string
}

// mulberry32: a small, fast, deterministic PRNG. Same seed, same sequence,
// every time, on every platform, unlike Math.random which is neither seeded
// nor cross-run stable.
function mulberry32(seed: number): () => number {
  let a = seed
  return function (): number {
    a |= 0
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  return h
}

// RFC4122-shaped v4 string, same convention the existing Math.random-based
// uuid_v4() fallbacks in conditions.ts/engine-interpolate.ts already use,
// just backed by the seeded generator so the sequence repeats across runs.
function makeSeededUuid(seed: string): () => string {
  const rng = mulberry32(hashSeed(seed))
  const hexDigit = () => Math.floor(rng() * 16).toString(16)
  return () => {
    let out = ''
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) { out += '-'; continue }
      if (i === 14) { out += '4'; continue }
      if (i === 19) { out += ((Math.floor(rng() * 16) & 0x3) | 0x8).toString(16); continue }
      out += hexDigit()
    }
    return out
  }
}

// Builds the per-render deterministic clock/uuid state, or null when
// determinism is off. A null return means every call site (executeDate,
// now_iso/now_ms/uuid_v4 in both interpolation surfaces) falls back to real
// Date/crypto.randomUUID, unchanged from before this feature. `explicit`
// lets a caller (the --deterministic CLI flag) opt in without setting the
// env var; env['LIVESTAGE_DETERMINISTIC'] === '1' is the other path in.
export function buildDeterminism(env: Record<string, string>, explicit?: boolean): DeterminismState | null {
  const on = explicit === true || env['LIVESTAGE_DETERMINISTIC'] === '1'
  if (!on) return null
  let now = new Date()
  const nowRaw = env['LIVESTAGE_NOW']
  if (nowRaw) {
    const parsed = new Date(nowRaw)
    if (!Number.isNaN(parsed.getTime())) now = parsed
  }
  const seed = env['LIVESTAGE_SEED'] ?? 'livestage-deterministic-default-seed'
  return { now, nextUuid: makeSeededUuid(seed) }
}
