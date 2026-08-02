import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Reach Via Code (feature 47): there is no @db or @http directive; external
// reach is @code under policy. Two worked examples prove it, each with the
// exact minimal policy grant it needs shipped alongside it.
const repoRoot = join(import.meta.dirname, '..', '..')
const cliEntry = join(repoRoot, 'dist', 'cli', 'cli.js')

function render(cwd: string, file: string): string {
  return execFileSync('node', [cliEntry, 'render', file], { cwd, encoding: 'utf8' })
}

describe('database example: driver code in @code, doc only renders the output', () => {
  it('renders a table of enterprise-plan customers, using only the granted javascript language', () => {
    const cwd = join(repoRoot, 'examples', 'database')
    const out = render(cwd, 'customers.stage')
    expect(out).toContain('| name')
    expect(out).toContain('Acme Corp')
    expect(out).toContain('Echo Systems')
    // starter/team-plan customers are filtered out by the driver script
    expect(out).not.toContain('Bright Labs')
    expect(out).not.toContain('Delta Freight')
  })
})

describe('HTTP health-check example: fetch in @code, doc only renders structured status', () => {
  it('renders a successful health check with status/ok/latency fields', () => {
    const cwd = join(repoRoot, 'examples', 'http-health')
    const out = render(cwd, 'check.stage')
    expect(out).toContain('Status: 200')
    expect(out).toContain('OK: true')
    expect(out).toMatch(/Latency: \d+ms/)
  })
})

describe('both examples ship the exact policy grant they need', () => {
  it.each(['database', 'http-health'])('%s: policy.json grants only code.languages=[javascript]', (dir) => {
    const policy = JSON.parse(readFileSync(join(repoRoot, 'examples', dir, '.livestage', 'policy.json'), 'utf8'))
    expect(policy.code.languages).toEqual(['javascript'])
    expect(policy.filesystem?.write_enabled).toBeFalsy()
    expect(policy.shell?.enabled).toBeFalsy()
  })
})
