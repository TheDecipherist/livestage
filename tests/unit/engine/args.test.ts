import { describe, it, expect } from 'vitest'
import {
  tokenizeArgs, parseVarFlags, varsFromEnv, buildArgsContext, argsEnvMirror, buildLiveStageContextJson,
} from '../../../src/engine/args.js'

describe('tokenizeArgs', () => {
  it('splits on whitespace', () => {
    expect(tokenizeArgs('sync foo bar')).toEqual(['sync', 'foo', 'bar'])
  })

  it('a quoted span with an embedded space is one token', () => {
    expect(tokenizeArgs('sync "hello world" done')).toEqual(['sync', 'hello world', 'done'])
  })

  it('empty/whitespace-only input returns an empty array', () => {
    expect(tokenizeArgs('')).toEqual([])
    expect(tokenizeArgs('   ')).toEqual([])
  })
})

describe('parseVarFlags', () => {
  it('parses k=v pairs', () => {
    expect(parseVarFlags(['a=1', 'b=2'])).toEqual({ a: '1', b: '2' })
  })

  it('a value containing = keeps everything after the first =', () => {
    expect(parseVarFlags(['url=https://x.test?a=1'])).toEqual({ url: 'https://x.test?a=1' })
  })

  it('a malformed entry with no = is skipped, not thrown', () => {
    expect(parseVarFlags(['noequals', 'a=1'])).toEqual({ a: '1' })
  })
})

describe('varsFromEnv', () => {
  it('extracts LIVESTAGE_VAR_* entries with the prefix stripped', () => {
    expect(varsFromEnv({ LIVESTAGE_VAR_FOO: 'bar', UNRELATED: 'x' })).toEqual({ FOO: 'bar' })
  })

  it('returns an empty object when no LIVESTAGE_VAR_* entries exist', () => {
    expect(varsFromEnv({ UNRELATED: 'x' })).toEqual({})
  })
})

describe('buildArgsContext', () => {
  it('with no input at all, everything defaults empty (passive hook render)', () => {
    const ctx = buildArgsContext({ env: {} })
    expect(ctx).toEqual({ args: '', argsList: [], vars: {} })
  })

  it('--args populates args and argsList', () => {
    const ctx = buildArgsContext({ args: 'sync now', env: {} })
    expect(ctx.args).toBe('sync now')
    expect(ctx.argsList).toEqual(['sync', 'now'])
  })

  it('falls back to LIVESTAGE_ARGS env when --args is not given', () => {
    const ctx = buildArgsContext({ env: { LIVESTAGE_ARGS: 'from-env' } })
    expect(ctx.args).toBe('from-env')
  })

  it('--var flags and LIVESTAGE_VAR_* env merge, CLI flags winning on conflict', () => {
    const ctx = buildArgsContext({
      varFlags: ['A=fromFlag', 'C=onlyFlag'],
      env: { LIVESTAGE_VAR_A: 'fromEnv', LIVESTAGE_VAR_B: 'onlyEnv' },
    })
    expect(ctx.vars).toEqual({ A: 'fromFlag', B: 'onlyEnv', C: 'onlyFlag' })
  })
})

describe('argsEnvMirror', () => {
  it('mirrors args into LIVESTAGE_ARGS and each var into LIVESTAGE_VAR_<NAME>', () => {
    const mirror = argsEnvMirror({ args: 'sync', argsList: ['sync'], vars: { K: 'v' } })
    expect(mirror).toEqual({ LIVESTAGE_ARGS: 'sync', LIVESTAGE_VAR_K: 'v' })
  })

  it('omits LIVESTAGE_ARGS when args is empty (nothing to mirror)', () => {
    const mirror = argsEnvMirror({ args: '', argsList: [], vars: {} })
    expect(mirror).toEqual({})
  })
})

describe('buildLiveStageContextJson', () => {
  it('produces the documented shape for @code (feature 29) to consume', () => {
    const json = buildLiveStageContextJson({ args: 'sync now', argsList: ['sync', 'now'], vars: { K: 'v' } }, 'doc.stage')
    expect(JSON.parse(json)).toEqual({ args: 'sync now', argN: ['sync', 'now'], vars: { K: 'v' }, doc: 'doc.stage' })
  })
})
