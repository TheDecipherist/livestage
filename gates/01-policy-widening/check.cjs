// Gate 1 (most important): security policy widening. The shortcut this
// catches is real, not hypothetical: `git *` shipped in the default
// allowlist through 1.0.1, a compound-command hole rode in with it.
//
// Four checks, over every .livestage/policy.json under the repo
// (root, examples/*, benchmarks/*) plus the trust store:
//   1. no `*` anywhere inside any shell.allow_patterns entry
//   2. code.languages is empty unless the file is on the reviewed
//      exception list (exceptions.json, committed, next to this script)
//   3. http.enabled is never true
//   4. the total shell.allow_patterns count across every policy.json
//      never exceeds the committed ceiling (pattern-count-ceiling.json)
// Plus: the trust store (~/.livestage/trust.json, or $HOME's equivalent)
// has gained no entries. "Just trust the directory" is the same
// shortcut one layer up from widening the policy itself.
const fs = require('fs')
const path = require('path')
const os = require('os')

// This script's own doc directory is gates/01-policy-widening/, two
// levels below the repo root, same assumption every other benchmarks/
// and examples/ script in this repo makes about its own depth.
const REPO_ROOT = path.resolve(process.cwd(), '..', '..')
const GATE_DIR = process.cwd()

function walkPolicyFiles(dir, out) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkPolicyFiles(full, out)
    } else if (entry.name === 'policy.json' && full.includes(`${path.sep}.livestage${path.sep}`)) {
      out.push(full)
    }
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

function main() {
  const policyFiles = walkPolicyFiles(REPO_ROOT, [])
  const exceptions = new Set(loadJson(path.join(GATE_DIR, 'exceptions.json'), { code_languages_allowed: [] }).code_languages_allowed)
  const ceiling = loadJson(path.join(GATE_DIR, 'pattern-count-ceiling.json'), { max_allow_patterns: 0 }).max_allow_patterns

  const problems = []
  let totalPatterns = 0

  for (const file of policyFiles) {
    const rel = path.relative(REPO_ROOT, file)
    const policy = loadJson(file, {})

    const patterns = policy.shell && Array.isArray(policy.shell.allow_patterns) ? policy.shell.allow_patterns : []
    totalPatterns += patterns.length
    for (const p of patterns) {
      if (typeof p === 'string' && p.includes('*')) {
        problems.push(`${rel}: shell.allow_patterns contains a wildcard: "${p}"`)
      }
    }

    const languages = policy.code && Array.isArray(policy.code.languages) ? policy.code.languages : []
    if (languages.length > 0 && !exceptions.has(rel)) {
      problems.push(`${rel}: code.languages is non-empty (${JSON.stringify(languages)}) but not on the reviewed exception list (gates/01-policy-widening/exceptions.json)`)
    }

    if (policy.http && policy.http.enabled === true) {
      problems.push(`${rel}: http.enabled is true`)
    }
  }

  if (totalPatterns > ceiling) {
    problems.push(`total shell.allow_patterns across every policy.json is ${totalPatterns}, above the committed ceiling of ${ceiling} (gates/01-policy-widening/pattern-count-ceiling.json)`)
  }

  // Trust store: every directory the store actually needs trusted to
  // render this repo's own @code/@shell-granted docs at all (every
  // directory holding one of the policy.json files just walked, since
  // each is already a reviewed, committed grant) is expected and fine.
  // Bootstrapping requires this: rendering THIS gate itself needs its
  // own directory trusted. What is NOT expected is a trust entry
  // pointing anywhere else, exactly the shape "hit a denial, trust the
  // directory instead of narrowing the command" would produce. A real
  // developer's daily-driver machine may carry other entries from
  // unrelated projects; this check only runs against $HOME's own store
  // (respects the env var, so tests isolate it the same way every other
  // trust-related test in this repo already does), so it is meant for
  // CI or a dedicated check invocation, a fresh environment, the same
  // assumption "dist/ built fresh" already makes elsewhere.
  const trustPath = path.join(os.homedir(), '.livestage', 'trust.json')
  const trustStore = loadJson(trustPath, { trusted: [] })
  const trusted = Array.isArray(trustStore.trusted) ? trustStore.trusted : []
  const allowedTrustDirs = new Set(policyFiles.map(f => path.dirname(path.dirname(f))))
  const unexpectedTrust = trusted.filter(t => !allowedTrustDirs.has(t))
  if (unexpectedTrust.length > 0) {
    problems.push(`trust store (${trustPath}) has ${unexpectedTrust.length} entr${unexpectedTrust.length === 1 ? 'y' : 'ies'} outside every reviewed policy.json directory: ${JSON.stringify(unexpectedTrust)}`)
  }

  const report = {
    pass: problems.length === 0,
    policyFileCount: policyFiles.length,
    totalPatterns,
    ceiling,
    trustedCount: trusted.length,
    problems,
  }
  fs.writeFileSync(path.join(GATE_DIR, 'report.json'), JSON.stringify(report, null, 2))

  const header = '| file | patterns | notes |\n|---|---|---|'
  const rows = policyFiles.map(f => {
    const rel = path.relative(REPO_ROOT, f)
    const policy = loadJson(f, {})
    const patterns = policy.shell && Array.isArray(policy.shell.allow_patterns) ? policy.shell.allow_patterns.length : 0
    const notes = []
    if (policy.code && Array.isArray(policy.code.languages) && policy.code.languages.length > 0) notes.push(`code.languages=${JSON.stringify(policy.code.languages)}`)
    return `| ${rel} | ${patterns} | ${notes.join(', ') || '-'} |`
  }).join('\n')
  const table = policyFiles.length > 0 ? `${header}\n${rows}` : '_(no policy.json files found)_'

  process.stdout.write(JSON.stringify({ ...report, table }))
}

main()
