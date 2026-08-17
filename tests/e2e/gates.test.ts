import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// feat/drift-gates, Part 4: "A gate that has never failed is a gate you
// are trusting, not using." Each test here performs the actual shortcut
// (a real wildcard in a real policy.json, a real .only in a real test
// file, a real hand-edit of a generated file, a real over-ceiling `any`)
// in a throwaway copy of the real check.js's target, and asserts the
// gate's own report names the specific problem, not just a generic
// failure. This is the same non-vacuousness proof
// readme-generation.test.ts already establishes for readme:check,
// applied to every required gate (1-4).
const repoRoot = join(import.meta.dirname, '..', '..')

function runGateCheck(gateDir: string): { pass: boolean; problems: string[]; onlyCount?: number; skipCount?: number } {
  const out = execFileSync('node', [join(repoRoot, 'gates', gateDir, 'check.cjs')], {
    cwd: join(repoRoot, 'gates', gateDir),
    encoding: 'utf8',
  })
  return JSON.parse(out)
}

describe('Gate 1 (security policy widening) actually fails on a real violation', () => {
  const policyPath = join(repoRoot, 'examples', 'agent-briefs', '.livestage', 'policy.json')

  it('the happy path passes on the real, current repo', () => {
    const result = runGateCheck('01-policy-widening')
    expect(result.pass).toBe(true)
  })

  it('a wildcard injected into a real allow_patterns entry fails the gate, naming the file and the pattern', () => {
    const original = readFileSync(policyPath, 'utf8')
    try {
      const policy = JSON.parse(original)
      policy.shell.allow_patterns.push('git *')
      writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)

      const result = runGateCheck('01-policy-widening')
      expect(result.pass).toBe(false)
      const joined = result.problems.join(' ')
      expect(joined).toContain('agent-briefs')
      expect(joined).toContain('git *')
    } finally {
      writeFileSync(policyPath, original)
    }
  })

  it('a code.languages grant with no reviewed exception fails the gate, naming the file', () => {
    const original = readFileSync(policyPath, 'utf8')
    try {
      const policy = JSON.parse(original)
      policy.code = { languages: ['python'], timeout: 10000, runners: {} }
      writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)

      const result = runGateCheck('01-policy-widening')
      expect(result.pass).toBe(false)
      expect(result.problems.join(' ')).toContain('agent-briefs')
    } finally {
      writeFileSync(policyPath, original)
    }
  })
})

describe('Gate 2 (hand-edited generated files) actually fails on a real hand-edit', () => {
  const readmePath = join(repoRoot, 'README.md')

  it('the happy path passes on the real, current repo (README.md at least)', () => {
    const result = runGateCheck('02-hand-edited-generated')
    const readmeRow = result.problems.find(p => p.includes('README.md'))
    expect(readmeRow).toBeUndefined()
  })

  it('hand-editing README.md\'s committed content fails the gate, naming the file and the source', () => {
    const original = readFileSync(readmePath, 'utf8')
    try {
      // Appended, not a substring replace: a replace target embedding the
      // current package version (e.g. "Version 1.0.2") goes stale on the
      // next version bump, silently turns into a no-op, and leaves the
      // "hand-edited" file byte-identical to the original, exactly the
      // false-negative this test exists to rule out.
      writeFileSync(readmePath, `${original}\n<!-- hand-edited, should never survive a real render -->\n`)
      const result = runGateCheck('02-hand-edited-generated')
      expect(result.pass).toBe(false)
      const readmeProblem = result.problems.find(p => p.startsWith('README.md'))
      expect(readmeProblem).toBeDefined()
      expect(readmeProblem).toContain('README.stage')
    } finally {
      writeFileSync(readmePath, original)
    }
  })
})

describe('Gate 3 (tests neutered) actually fails on a real .only', () => {
  let scratchTestFile: string

  it('the .only/.skip census is clean on the real, current repo (independent of the test-count baseline, which depends on .vitest-results.json reflecting a FULL npm test run, not just this file, same pre-existing assumption check-test-baseline.mjs itself already documents)', () => {
    const result = runGateCheck('03-tests-neutered')
    expect(result.onlyCount).toBe(0)
    expect(result.skipCount).toBe(0)
  })

  // The literal substring these two probes write is never spelled out
  // directly in THIS file's own source (built via string concatenation
  // instead): gates.test.ts is itself a real file under tests/, and gate
  // 3's own census would otherwise flag its OWN adversarial test
  // descriptions/fixtures as a real violation, exactly the kind of
  // string-vs-real-code false positive gate 4's `@ts-ignore` mention had
  // to dodge the same way.
  const onlyCall = ['it', '.', 'only', '('].join('')
  const skipCall = ['it', '.', 'skip', '('].join('')

  it(`a real ${onlyCall.replace('(', '')} call in tests/ fails the gate, naming the file and line`, () => {
    scratchTestFile = join(repoRoot, 'tests', 'unit', 'engine', '__gate3-adversarial-probe__.test.ts')
    try {
      writeFileSync(scratchTestFile, `import { describe, it, expect } from 'vitest'\ndescribe('probe', () => {\n  ${onlyCall}'x', () => { expect(1).toBe(1) })\n})\n`)
      const result = runGateCheck('03-tests-neutered')
      expect(result.pass).toBe(false)
      const joined = result.problems.join(' ')
      expect(joined).toContain('__gate3-adversarial-probe__.test.ts')
      expect(joined).toMatch(/:3\b/)
    } finally {
      rmSync(scratchTestFile, { force: true })
    }
  })

  it(`a real ${skipCall.replace('(', '')} call with no reason comment fails the gate`, () => {
    scratchTestFile = join(repoRoot, 'tests', 'unit', 'engine', '__gate3-adversarial-probe__.test.ts')
    try {
      writeFileSync(scratchTestFile, `import { describe, it, expect } from 'vitest'\ndescribe('probe', () => {\n  ${skipCall}'x', () => { expect(1).toBe(1) })\n})\n`)
      const result = runGateCheck('03-tests-neutered')
      expect(result.pass).toBe(false)
      expect(result.problems.join(' ')).toContain('no reason comment')
    } finally {
      rmSync(scratchTestFile, { force: true })
    }
  })
})

describe('Gate 4 (type and lint escapes) actually fails on a real `: any`', () => {
  const probeFile = join(repoRoot, 'src', 'engine', '__gate4_adversarial_probe__.ts')

  it('the happy path passes on the real, current repo', () => {
    const result = runGateCheck('04-type-lint-escapes')
    expect(result.pass).toBe(true)
  })

  it('a real `: any` type annotation in src/ fails the gate, naming the file and line', () => {
    try {
      writeFileSync(probeFile, 'export const gateFourProbe: any = 1\n')
      const result = runGateCheck('04-type-lint-escapes')
      expect(result.pass).toBe(false)
      const joined = result.problems.join(' ')
      expect(joined).toContain('__gate4_adversarial_probe__.ts')
      expect(joined).toMatch(/:1\b/)
    } finally {
      rmSync(probeFile, { force: true })
    }
  })

  it('the English word "any" in a comment/string does NOT trip the gate (the false-positive this census was built to avoid)', () => {
    try {
      writeFileSync(probeFile, '// has any of this run? any custom value, for any reason\nexport const gateFourProbe = "any value at all"\n')
      const result = runGateCheck('04-type-lint-escapes')
      expect(result.pass).toBe(true)
    } finally {
      rmSync(probeFile, { force: true })
    }
  })
})

describe('gates/ own hooks and policy files stay off Gate 1\'s own radar (bootstrapping check)', () => {
  it('every gate directory\'s own code.languages grant is on the reviewed exception list', () => {
    const exceptions = JSON.parse(readFileSync(join(repoRoot, 'gates', '01-policy-widening', 'exceptions.json'), 'utf8'))
    for (const n of ['01-policy-widening', '02-hand-edited-generated', '03-tests-neutered', '04-type-lint-escapes']) {
      const p = join(repoRoot, 'gates', n, '.livestage', 'policy.json')
      if (!existsSync(p)) continue
      expect(exceptions.code_languages_allowed).toContain(`gates/${n}/.livestage/policy.json`)
    }
  })
})
