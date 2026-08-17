// Gate 4: type and lint escapes. `any`, `as unknown as`, `@ts-ignore`,
// `@ts-expect-error`, `eslint-disable` are all one-line ways to make a
// red thing green. Census each across src/, assert the count never
// grows above a committed ceiling, render the live list so a reviewer
// sees exactly where they are.
//
// `any` needs a real type-syntax-shaped pattern, not a bare word match:
// the English word "any" (has any render run?, any custom value, any
// embedded...) appears constantly in comments and prose strings and is
// not a type escape. Matched only when adjacent to actual TypeScript
// type syntax (: any, as any, <any, any[], any> or any, in a generic
// position). Comment-only lines are skipped; a trailing // comment on a
// code line is stripped before matching so a real `: any` earlier on
// the same line still counts.
//
// The tracked tests/conformance/rules.conformance.test.ts implicit-any
// gap (noImplicitAny errors from untyped params, not a literal "any" in
// source at all, so it is not textually greppable the way the five
// patterns here are) is surfaced in this gate's own report as context,
// not re-asserted here: it is already tracked by `npm run typecheck`
// and documented in CLAUDE.md as a known, non-regressing gap. This gate
// does not hide it by only reporting a clean census of what it CAN see.
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const REPO_ROOT = path.resolve(process.cwd(), '..', '..')
const GATE_DIR = process.cwd()
const SRC_DIR = path.join(REPO_ROOT, 'src')

function walkTsFiles(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkTsFiles(full, out)
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

function loadJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return fallback
  }
}

function stripLineComment(line) {
  // Rough heuristic (not a real tokenizer): first `//` not inside an
  // obvious string literal. Good enough for a census over this
  // codebase's own style, not a security boundary.
  const idx = line.indexOf('//')
  return idx === -1 ? line : line.slice(0, idx)
}

const ANY_TYPE_RE = /(:\s*any\b)|(<\s*any\b)|(\bas\s+any\b)|(\bany\[\])|(\bany\s*>)|(\bany\s*,)/
const PATTERNS = [
  { key: 'any', label: 'any (type position)', test: line => ANY_TYPE_RE.test(stripLineComment(line)) },
  { key: 'asUnknownAs', label: 'as unknown as', test: line => stripLineComment(line).includes('as unknown as') },
  { key: 'tsIgnore', label: '@ts-ignore', test: line => line.includes('@ts-ignore') },
  { key: 'tsExpectError', label: '@ts-expect-error', test: line => line.includes('@ts-expect-error') },
  { key: 'eslintDisable', label: 'eslint-disable', test: line => line.includes('eslint-disable') },
]

function census() {
  const files = walkTsFiles(SRC_DIR, [])
  const hits = Object.fromEntries(PATTERNS.map(p => [p.key, []]))
  for (const file of files) {
    const rel = path.relative(REPO_ROOT, file)
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const trimmed = line.trim()
      const isCommentLine = trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**')
      for (const p of PATTERNS) {
        // The ts-ignore, ts-expect-error, and eslint-disable directives
        // ARE the comment (that's the whole mechanism), so those three
        // still count even on a comment-shaped line; only the
        // `any`/`as unknown as` syntax checks skip pure comment lines.
        if (isCommentLine && (p.key === 'any' || p.key === 'asUnknownAs')) continue
        if (p.test(line)) hits[p.key].push(`${rel}:${i + 1}`)
      }
    })
  }
  return hits
}

function implicitAnyGapCount() {
  try {
    const out = execSync('npx tsc --noEmit', { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return (out.match(/error TS/g) || []).length
  } catch (err) {
    const out = (err.stdout || '') + (err.stderr || '')
    return (out.match(/error TS/g) || []).length
  }
}

function main() {
  const ceilings = loadJson(path.join(GATE_DIR, 'ceilings.json'), {})
  const hits = census()

  const problems = []
  const counts = {}
  for (const p of PATTERNS) {
    const count = hits[p.key].length
    counts[p.key] = count
    const ceiling = ceilings[p.key]
    if (typeof ceiling !== 'number') {
      problems.push(`no committed ceiling for "${p.key}" in gates/04-type-lint-escapes/ceilings.json`)
      continue
    }
    if (count > ceiling) {
      problems.push(`${p.label}: ${count} found, above the committed ceiling of ${ceiling} (gates/04-type-lint-escapes/ceilings.json): ${hits[p.key].join(', ')}`)
    }
  }

  const report = {
    pass: problems.length === 0,
    counts,
    ceilings,
    hits,
    // Live, not asserted on: the honest starting floor CLAUDE.md already
    // documents (implicit-any from tsc's noImplicitAny, invisible to
    // this script's own textual census since no literal "any" appears
    // in source for it). Surfaced so a reviewer sees the whole picture,
    // not gated here since npm run typecheck already gates it.
    knownImplicitAnyGapErrorCount: implicitAnyGapCount(),
    problems,
  }
  fs.writeFileSync(path.join(GATE_DIR, 'report.json'), JSON.stringify(report, null, 2))

  const header = '| pattern | count | ceiling |\n|---|---|---|'
  const rows = PATTERNS.map(p => `| ${p.label} | ${counts[p.key]} | ${ceilings[p.key] ?? '?'} |`).join('\n')
  process.stdout.write(JSON.stringify({ ...report, table: `${header}\n${rows}` }))
}

main()
