---
name: mdd
description: The help page. Shows the full catalog of MDD commands plus every other invokable skill available in this session (project, personal, and plugin scope), grouped by category, with exactly what each one does and how to invoke it. Invoke with /mdd, optionally with a category (mdd, plan, ops, review, build, advisory, other) to show just that group.
disable-model-invocation: true
user-invocable: true
argument-hint: "[optional category]"
arguments: [category]
allowed-tools: "Read, Glob"
---

Print the catalog below for the user. If `$category` is given, print only the
matching group (fuzzy match on the group title). Keep the exact grouping and
order; the MDD core group always comes first. Format each group as a heading
plus a table of `/command` and its one-line description. No preamble, the
catalog IS the output. After the catalog, run the drift check at the bottom.

## MDD, the core workflow

| Command | What it does |
|---|---|
| `/build <feature>` | Document and build a feature the full MDD way: explore in parallel, trace data flow, write the feature doc, generate failing tests (Red Gate), plan in blocks, implement to green (Green Gate), verify against the real runtime. The flagship. |
| `/bug <symptom>` | Report and fix a bug: traces the symptom into the code, derives the owning docs from the defect's files, fixes it (lightweight or full gates), reconciles the real diff against the doc set, and leaves a dated Bug Fixes record in every touched doc. |
| `/task <description>` | A scoped one-off (chore, config change, small refactor) recorded the MDD way as a frozen task doc that is never flagged as drifted. |
| `/update <doc id>` | Resync a feature doc with code that changed: diffs doc against source, rewrites only affected sections, preserves known issues, clears the drift flag. |
| `/audit [scope]` | Shard the code across parallel agents and audit it against the feature docs, plus specialist review passes; merges into one deduplicated, confidence-ranked report and optionally fixes. |
| `/fix-known-issues [scope]` | Drain the known_issues backlog: verifies stale entries, fixes the fixable through a mini red-green loop, asks once about everything needing a decision, moves each closed entry to the doc's Fixed Issues section with date and evidence. |
| `/scan` | Detect documentation drift workspace-wide: classifies every doc as in_sync, drifted, broken, untracked, or no-path, and recommends the fix per doc. |
| `/status` | Full MDD overview (docs, tests, known issues, initiatives, waves, drift counts), then rebuilds the session brief. The "where am I" command. |
| `/import-spec <path>` | Turn an external spec into a numbered tree of MDD docs in build-dependency order: initiative, waves with demo-states, feature docs, previewed as a mandatory dry run before writing. The dry-run approval also picks the execution mode: unattended end-to-end (build every wave, walk away), wave 1 then pause, or docs only. |
| `/mdd-init [focus]` | Install MDD into a project on evidence: scans the codebase, proposes a justified plan (every rule and hook tied to something found), installs only what is approved. |
| `/reverse-engineer [path]` | Generate feature docs from existing source code: one feature, or corpus mode for a whole undocumented project (partition, dependency-ordered numbering, dry-run preview, resumable batch writing). Discloses what could not be inferred via a [gap] known_issues entry per doc. |
| `/deprecate <doc id>` | Retire a feature doc safely: flags dependents, archives, asks separately before touching source or tests. Never auto-deletes code. |
| `/upgrade` | Batch-patch missing frontmatter fields across every doc, non-destructively. How untracked docs become in-sync in one pass. |
| `/note <text \| list \| clear>` | Append-only working notes in the session brief that survive across sessions. |
| `/connect` | Force a full rebuild of the connections map (normally the sync hook keeps it current automatically). |
| `/graph` | The cross-feature dependency map plus initiative/wave hierarchy, flagging broken, risky, and orphan dependencies. |
| `/rebuild-tags` | Generate tags for docs missing them so the brief's auto-suggest can match prompts to features. |
| `/manual [--force]` | Generate a user-facing manual from every feature doc, written for someone who has never seen the code. Incremental via content hashes. |
| `/conformance` | Generate rule-conformance tests from `.claude/rules` and run them, reporting which rules the code violates. |
| `/security-rules` | Scan the stack for known CVEs with free local tools and turn every genuine gap into a new path-scoped rule. |
| `/context-budget [--api]` | Estimate the per-turn token cost of this project's `.claude` config, ranking the top contributors. |
| `/rules-for <file>` | Which rules govern this file and do their specs pass, evaluated live. Flags files no rule matches. The inverse of `/conformance --doctor`. |

## Planning, multi-wave efforts

| Command | What it does |
|---|---|
| `/plan-initiative [title]` | Create the top-level container for a multi-wave effort, guided or blank, with a content hash so manual edits are detectable. |
| `/plan-wave <slug>` | Plan one wave inside an initiative, gated on the initiative being unedited and its open questions answered. |
| `/plan-execute <wave slug>` | Build every feature in a wave through the full MDD flow, tracked in a manifest that survives interruption. Interactive, automated, or unattended (best-judgment with a logged judgment trail, stops only on genuine blockers). Independent features build in parallel via builder agents in worktrees; merge and integration verify stay serial. Every wave starts on a fresh branch and ends committed and merged to main. |
| `/plan-sync` | Reconcile manual edits to initiative and wave files via content hashes, flagging what may now be out of date. |
| `/plan-remove-feature <wave> <feature>` | Remove a feature from a wave safely, blocking if something in the wave depends on it. |
| `/plan-cancel-initiative <slug>` | Cancel an initiative: status cancelled, optional archiving, never deletes feature docs. |

## Ops, deployment runbooks

| Command | What it does |
|---|---|
| `/ops <description \| list>` | Create a deployment runbook (regions, services, health checks, canary strategy) that `/runop` can execute. Credentials as env var names only. |
| `/runop <slug>` | Execute a runbook: pre-flight health checks, canary-gated region-by-region deploy, post-flight verification, health written back. |
| `/update-op <slug>` | Edit an existing runbook with current values pre-filled and a diff, preserving live health data. |

## Review and analysis (forked, read-only)

| Command | What it does |
|---|---|
| `/code-review` | Review a diff, PR, or files for correctness, security, and maintainability with cited, severity-ranked findings. Does not edit. |
| `/debugger` | Root-cause diagnosis for crashes, intermittent bugs, leaks, and "works locally, fails in prod". Reports cause and fix. |
| `/design-review` | Critique UI/UX for usability, accessibility, and distinctiveness with evidence-based findings. |
| `/dependency-vetting` | Vet a package for supply-chain risk before adding it. Evidence-backed verdict, installs nothing. |
| `/research-assistant [question]` | Switch into a read-and-analyze thinking-partner mode for the rest of the session; saves research to files on request, edits nothing. |
| `/seo-audit <url>` | Full technical SEO and LLM-readability audit of a URL via live browser DOM inspection. |

## Builders and scaffolding

| Command | What it does |
|---|---|
| `/create-service` | Scaffold a new microservice following the server/handlers/adapters architecture and register it as an MDD feature. |
| `/mcp-builder` | Build a well-designed MCP server exposing a service or API to an LLM. |
| `/test-writer` | Write tests that catch bugs: explicit assertions, realistic data, shared helpers, run-to-confirm. (Also fires on its own when tests are asked for.) |
| `/advanced-skill-writer` | Write or review a production-grade skill with currently-correct frontmatter, verified against live docs. |

## Advisory knowledge (fires on its own when relevant)

| Skill | When it speaks up |
|---|---|
| `waf` | You are about to expose a public app or API: recommends a WAF and the DetectionOnly-first rollout. Config detail lives in the modsecurity path rule. |
| `web-architecture` | Starting a site or web app: how pages should render (SSR/SSG/CSR) and when a framework is warranted. |
| `tui-builder` | Building an interactive terminal UI: battle-tested Ink/resize rules. |
| `dev-pitfalls` | A cryptic error or slow WSL/git/CRLF weirdness: checks the environment layer before you debug the wrong one (ENOSPC, exec format error, dubious ownership, /mnt/c). |
| `mongodb-backups` | Writing backup/restore pipelines: streaming to S3, the --nsInclude archive trap, restore tiering, tested restores. |
| `mongodb-replica-sets` | Setting up or tuning a replica set: topology, write concern, OS tuning, WiredTiger cache in containers, Swarm traps. |

## Always on underneath

Path rules load domain knowledge automatically next to matching files (MongoDB,
Node lifecycle, API layering, schemas, Docker, nginx, ModSecurity, plus any
project-shape rules /mdd-init installed for this repo). Hooks enforce
regardless of what the model decides: branch guard, test freeze, mongo lint,
no-em-dash, secret scan, dangerous-command block, and any project-shape
gateway /mdd-init wired here. Review subagents (code-reviewer, security-reviewer,
performance-reviewer, silent-failure-hunter, pr-test-analyzer, doc-reviewer) are
dispatched automatically during builds and audits. The status bar tracks every
flow live; `/status` is the human-readable version.

And `/mdd` prints this catalog (`/mdd plan`, `/mdd ops`, and so on for one group).

## Beyond this kit: every other invokable skill (run after printing the catalog)

The kit is not the whole picture; the user may have personal and plugin skills
too. Discover and print them so /mdd is the ONE complete answer to "what can I
run here":

1. Glob `~/.claude/skills/*/SKILL.md` (personal scope) and
   `~/.claude/plugins/*/skills/*/SKILL.md` plus
   `~/.claude/plugins/*/*/skills/*/SKILL.md` (plugin scope). Also include any
   skills visible in this session's available-skills listing that are not in
   the catalog above.
2. For each, read only the frontmatter. Skip any with `user-invocable: false`
   (not invokable), and skip exact name-duplicates of kit skills (the project
   copy wins).
3. Print them under an `Other invokable skills (outside this kit)` heading,
   grouped `Personal` then `Plugins` (plugin name in parens), as the same
   two-column table: `/name` and a one-line summary distilled from its
   description. Every listed entry is typeable as `/name`, that is the point.
4. If a scope has none, omit that group silently.

## Drift check (also after printing)

Compare the kit catalog above against `.claude/skills/*/SKILL.md` folder names
(the `mdd` folder is this skill itself, skip it). Add any project skill missing
from the catalog to the `Other invokable skills` section with its frontmatter
description, and note any catalog entry whose folder no longer exists. Keep the
catalog updated when kit skills are added or removed, it is the front door.
