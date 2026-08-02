---
name: security-rules
description: Scan the stack for known vulnerabilities with free local tools, compare each finding against existing rules, and turn every genuine gap into a new path-scoped rule targeting the vulnerability class. No patching, no installs, rules only. Invoke with /security-rules.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Read, Grep, Glob, Write, Bash(npm audit *), Bash(osv-scanner *), Bash(snyk *), Bash(which *)"
---

Keep the rule set current against known vulnerabilities without manual maintenance. This
generates audit rules only, it never patches dependencies, changes source, or installs
anything. No API keys, all scanners are free.

## SS0, read current rules
Read every `.claude/rules/*.md`. Extract each rule's description and any `Reference:
CVE-...` token, these are the dedup keys. If none exist, every finding is a gap.

## SS1, scan
Run scanners in priority order, each failure a one-line warning, never a halt:
`npm audit --json` (if a package manifest exists), then `osv-scanner --format json .`
(multi-language, if installed), then `snyk test --json` (if installed). Parse each for
package, ecosystem, severity, CVE/advisory id, title, and attack vector. If a scanner is
missing or times out (30s), skip it with a note. If none apply, report and stop.
Aggregate findings, deduplicating by CVE id across scanners (keep the richer description).

## SS2, gap analysis
For each finding, decide if an existing rule already covers it. Two steps: exact CVE
match (a rule with `Reference: <cve>` for this cve is covered, skip it), then semantic
coverage (does any rule address the same vulnerability CLASS, even in different words?).
Prototype pollution via query params is covered by any prototype-pollution rule; ReDoS
is covered by any regex-DoS rule. But an open redirect is NOT covered by an SSRF rule
(different class), and a timing attack is NOT covered by generic input validation. A
finding covered by neither is a gap.

## SS3, generate rules
Map severity to priority: critical and high -> P2, medium -> P3, low -> P4. P1 is
reserved for MDD's own invariants and is never auto-generated. For each gap, write a new
path-scoped rule to `.claude/rules/security-<class>.md` with a `paths:` glob targeting
where the pattern would appear. Write the rule to target the CLASS, not the CVE instance,
so it catches future variants: describe the attack vector in general terms, state the
concrete thing to check in code, and include the CVE as a `Reference:` tag for future
dedup. Good: "unvalidated redirect destination allows open redirect, check targets are
allowlisted or relative-only. Reference: CVE-...". Bad: "express 4.x open redirect,
upgrade to 4.19.2". Do not duplicate an existing rule's class.

## SS4, report and register
Write a summary to `.mdd/audits/security-scan-<date>.md`: scanners run and skipped,
findings reviewed, already-covered, new gaps, rules generated, and the full text of each
new rule. If RuleCatch is installed, register each new rule with it so it is monitored at
runtime too. When run as a sub-task of `/audit` (security scan enabled), suppress the
user-facing output and just write the file and return.

## Messaging

Print one plain `[security-rules] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set security-rules <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done security-rules` with the DONE line (pre-approved, best-effort, silent).
