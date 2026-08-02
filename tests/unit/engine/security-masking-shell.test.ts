import { describe, it, expect } from 'vitest'
import { defaultSecurityConfig } from '../../../src/engine/security/config.js'
import { applyMasking } from '../../../src/engine/security/masking.js'
import { checkShellCommand } from '../../../src/engine/security/shell.js'
import { SHELL_ALWAYS_BLOCK, SHELL_ALWAYS_ALERT } from '../../../src/engine/security/rules.js'

describe('content masking', () => {
  it('masks api_key pattern', () => {
    const { masked, wasMasked } = applyMasking('api_key: sk-abc123def456ghi789')
    expect(wasMasked).toBe(true)
    expect(masked).toContain('***MASKED***')
    expect(masked).not.toContain('sk-abc123def456ghi789')
  })

  it('masks AWS access key', () => {
    const { masked, wasMasked } = applyMasking('key: AKIAIOSFODNN7EXAMPLE')
    expect(wasMasked).toBe(true)
    expect(masked).toContain('***MASKED***')
  })

  it('masks GitHub personal access token', () => {
    const { masked, wasMasked } = applyMasking('ghp_AbCdEfGhIjKlMnOpQrStUvWxYz1234567890')
    expect(wasMasked).toBe(true)
    expect(typeof masked).toBe('string')
  })

  it('masks Stripe live key', () => {
    const { masked, wasMasked } = applyMasking('sk_live_abcdefghijklmnopqrstuvwxyz12')
    expect(wasMasked).toBe(true)
    expect(typeof masked).toBe('string')
  })

  it('masks MongoDB connection string', () => {
    const { masked, wasMasked } = applyMasking('mongodb://user:secret@host:27017/db')
    expect(wasMasked).toBe(true)
    expect(typeof masked).toBe('string')
  })

  it('masks PostgreSQL connection string', () => {
    const { masked, wasMasked } = applyMasking('postgresql://admin:pass@db.example.com:5432/mydb')
    expect(wasMasked).toBe(true)
    expect(typeof masked).toBe('string')
  })

  it('masks JWT token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'
    const { masked, wasMasked } = applyMasking(jwt)
    expect(wasMasked).toBe(true)
    expect(typeof masked).toBe('string')
  })

  it('does not mask regular content', () => {
    const { masked, wasMasked } = applyMasking('# Hello World\n\nThis is a regular document.')
    expect(wasMasked).toBe(false)
    expect(masked).toBe('# Hello World\n\nThis is a regular document.')
  })

  it('does not mask normal short variable values', () => {
    const { masked, wasMasked } = applyMasking('NODE_ENV=dev\nPORT=3000\nDEBUG=true')
    expect(wasMasked).toBe(false)
    expect(typeof masked).toBe('string')
  })

  it('applies user masking patterns', () => {
    const config = { ...defaultSecurityConfig().filesystem, user_masking_patterns: ['my-custom-\\S+'] }
    const { masked, wasMasked } = applyMasking('value: my-custom-secret', config)
    expect(wasMasked).toBe(true)
    expect(typeof masked).toBe('string')
  })

  it('skips masking for allow_unmasked_paths', () => {
    const config = { ...defaultSecurityConfig().filesystem, allow_unmasked_paths: ['safe/*.json'] }
    const { masked, wasMasked } = applyMasking('api_key: mysecret', config, 'safe/config.json')
    expect(wasMasked).toBe(false)
    expect(typeof masked).toBe('string')
  })
})

describe('built-in immutable shell rules', () => {
  it('SHELL_ALWAYS_BLOCK contains rm -rf variants', () => {
    expect(SHELL_ALWAYS_BLOCK.some(p => p.startsWith('rm -rf'))).toBe(true)
  })

  it('SHELL_ALWAYS_BLOCK contains curl pipe to bash', () => {
    expect(SHELL_ALWAYS_BLOCK.some(p => p.includes('curl') && p.includes('bash'))).toBe(true)
  })

  it('SHELL_ALWAYS_BLOCK contains eval', () => {
    expect(SHELL_ALWAYS_BLOCK.some(p => p.startsWith('eval'))).toBe(true)
  })

  it('SHELL_ALWAYS_ALERT contains sudo', () => {
    expect(SHELL_ALWAYS_ALERT.some(p => p.startsWith('sudo'))).toBe(true)
  })

  it('SHELL_ALWAYS_ALERT contains ssh', () => {
    expect(SHELL_ALWAYS_ALERT.some(p => p.startsWith('ssh'))).toBe(true)
  })
})

describe('shell jail', () => {
  // Default config now ships shell enabled with a curated allowlist; use an
  // explicit-disabled config for the "blocks when disabled" test.
  const defaultConfig = defaultSecurityConfig().shell
  const disabledConfig = { ...defaultConfig, enabled: false }

  it('blocks when shell is explicitly disabled', () => {
    const result = checkShellCommand('ls -la', disabledConfig)
    expect(result.allowed).toBe(false)
  })

  it('blocks command not in allowlist even when enabled', () => {
    const cfg = { ...disabledConfig, enabled: true, allow_patterns: ['git log *'] }
    expect(checkShellCommand('ls -la', cfg).allowed).toBe(false)
    expect(checkShellCommand('ls -la', cfg).tier).toBe('not_allowed')
  })

  it('allows command matching allowlist pattern', () => {
    const cfg = { ...disabledConfig, enabled: true, allow_patterns: ['git log *'] }
    expect(checkShellCommand('git log --oneline -5', cfg).allowed).toBe(true)
  })

  it('deny_patterns wins over allowlist', () => {
    const cfg = { ...disabledConfig, enabled: true, allow_patterns: ['rm *'], deny_patterns: ['rm *'] }
    const result = checkShellCommand('rm oldfile.txt', cfg)
    expect(result.allowed).toBe(false)
    expect(result.tier).toBe('deny_pattern')
  })

  it('always_block cannot be overridden by allowlist', () => {
    const cfg = { ...disabledConfig, enabled: true, allow_patterns: ['rm -rf *'] }
    const result = checkShellCommand('rm -rf /', cfg)
    expect(result.allowed).toBe(false)
    expect(result.tier).toBe('always_block')
  })

  it('blocks rm -rf ~', () => {
    const cfg = { ...disabledConfig, enabled: true, allow_patterns: ['*'] }
    const result = checkShellCommand('rm -rf ~', cfg)
    expect(result.allowed).toBe(false)
    expect(result.tier).toBe('always_block')
  })

  it('blocks eval commands', () => {
    const cfg = { ...disabledConfig, enabled: true, allow_patterns: ['eval *'] }
    const result = checkShellCommand('eval "rm -rf /"', cfg)
    expect(result.allowed).toBe(false)
    expect(result.tier).toBe('always_block')
  })
})
