---
name: mdd-init
description: Set up MDD in a project on an evidence-based install basis. Scans the codebase, proposes a plan where every rule and hook is justified, and installs only the approved plan customized to the real stack. Invoke with /mdd-init.
disable-model-invocation: true
user-invocable: true
argument-hint: "[optional focus area]"
arguments: [focus]
---

Set up MDD in this project. One governing principle: install nothing without
evidence and consent. Every rule and hook must be justified by something found in
the codebase or explicitly requested. When in doubt, leave it out, unused config
costs tokens and trust forever.

## Phase 1: Scan (read-only, no writes)

Say: `[mdd-init 1/5] Scanning the codebase for evidence.`
Status bar mirror: alongside each phase's Say line run `node .claude/hooks/lib/statusbar.cjs set mdd-init <N> 5 "<label>"`, and `done mdd-init` at the end.

Build an evidence table. Do not stop at manifests, read real code.
- Stack and real commands: `package.json`/`pyproject.toml`/`Cargo.toml`/`go.mod`, CI workflows. Record the actual build/test/lint commands, not guesses.
- Source layout: the real source directories. These become rule `paths:` globs, record actual paths, never assume `src/`.
- Tests: config files, then open 2-3 real test files for runner, naming, layout.
- Data layer: adapters, repositories, `db/`, ORM/driver in use (MongoDB, StrictDB, SQL).
- Frontend: `.tsx`/`.vue`/`.svelte`, component and styles directories.
- Infra: Dockerfiles, compose/stack files, nginx configs.
- Git: default branch, whether PRs are part of the workflow.
- Existing AI config to migrate, never clobber: `CLAUDE.md`, `.cursorrules`, `AGENTS.md`.

If `$focus` is set, weight the scan toward it.

## Phase 2: Confirm

Say: `[mdd-init 2/5] Findings below.` Then the summary, ending in a `WAITING ON YOU` block.

Present a compact findings summary and confirm it with the user before proposing
anything. Ask about anything ambiguous or invisible to the scan (generated dirs to
never touch, unusual deploy constraints, domain terms).

## Phase 3: Plan (the contract)

Say: `[mdd-init 3/5] Proposed install plan below. Nothing written yet.`

Produce one table: for every MDD component, Install? / Evidence / Cost class
(always-loaded / path-scoped / invoked-only / hook). Hard mapping:
- A rule installs only if its stack is present, and its `paths:` is rewritten to the real directories found.
- `mongodb-rules.md` and `mongo-lint.sh` only if MongoDB or StrictDB is detected.
- PROJECT-SHAPE rules install only where the shape exists, and every skipped rule is REPORTED with its reason (a rule whose globs match nothing counts toward apparent coverage while asserting nothing, mdd-notes2 2.3): `react-router.md` only when React Router is detected. Rules and gateway hooks tailored to ONE architecture (a specific monorepo's contracts, a project's driver-boundary gateway) belong in that project's own repo, never in the kit; when the scan finds such project-owned rules or hooks already present, treat them as authoritative, never overwrite them, and include them in the coverage report. After installing, run `node .claude/hooks/lib/conformance-gen.cjs --doctor` and include its summary (live/vacuous/spec-less counts) in the install report.
- Frontend rules only if frontend files exist. Infra rules only if Docker/nginx exist.
- The gate hooks (branch-guard, test-freeze) and the doc hooks (drift-sentinel, frontmatter-validate) always install, they are the spine.
- The safety hooks (scan-secrets, block-dangerous-commands) always install.
- The status bar always installs (statusline.cjs, the statusLine settings entry, statusbar-activity.sh, and hooks/lib/statusbar.cjs), it is the UX spine.
- The global CLAUDE.md (`global/CLAUDE.md` in the kit) is its own plan line,
  target `~/.claude/CLAUDE.md`, cost class always-loaded-everywhere. It carries
  the rules that are true in every repo (never commit secrets, .env is
  read-normal/commit-never, ask before deploy, `.ai_temp/`, markdown writing
  rules), so they hold even in projects that never ran /mdd-init.
- LSP setup installs as a PAIR or not at all, never half: when TypeScript is detected, the plan includes both the plugin enable (`typescript-lsp@claude-plugins-official` in enabledPlugins) and the binary install (`npm install -g typescript-language-server typescript`). The binary is a machine-global npm install, so it is its own line in the plan table the user approves; a plugin without the binary silently degrades every LSP-backed gate to grep (the lsp-readiness hook catches the half-configured state, /mdd-init's job is to never create it). Non-TS projects skip both, the grep fallback is correct there.
Then a short "not installing" list, each with a one-line reason. Get explicit approval.

## Phase 4: Apply exactly the plan

Say: `[mdd-init 4/5] Approved. Installing the plan.`

- Copy only approved files. Rewrite each rule's `paths:` to the real directories.
- Project CLAUDE.md: seed from the kit-root CLAUDE.md template, replacing every
  angle-bracket placeholder with scan evidence (real stack, real commands, the
  project's actual load-bearing rule). If a CLAUDE.md already exists, merge the
  template's missing sections into it, never clobber user content. No
  placeholder may survive Phase 4; an unfillable section is deleted, not
  shipped as `<...>`.
- Wire `settings.json` to only the hooks being installed, and allow only commands that exist here.
- Scaffold the base `.mdd/` by running `node .claude/hooks/lib/mdd-ensure.cjs` (creates `00-frontmatter-spec.md`, `.startup.md`, `.state.json` idle, `docs/`, `waves/`; idempotent, never overwrites an existing file). This is the single source of the minimal scaffold, do not hand-write those files here.
- Install the kit's `.gitattributes` at the project root if none exists (LF everywhere, the CRLF exception for .bat/.cmd/.ps1, binaries marked): the kit's hooks are bash scripts, and one CRLF round trip through a Windows filesystem kills every one of them with `bad interpreter: /bin/bash^M` while they appear installed. If a `.gitattributes` exists, check it covers `*.sh text eol=lf` and propose the missing lines, never overwrite. When installing into a repo with existing commits, also run `git add --renormalize .` and show what changed, otherwise the rules only apply to future files.
- Add gitignore entries for `.mdd/.state.json`, `.mdd/.drift`, `.mdd/audits/`, `.mdd/jobs/`, `.mdd/.statusbar.json`, `.mdd/.status-activity.json`, `.claude/settings.local.json`, `.worktrees/` (parallel feature builds), `.ai_temp/` (the agent scratch space; its ONLY special treatment is that the branch guard does not block writes there, every other rule and hook applies as normal, and it is always gitignored). If the project already uses a scratch convention (`_ai_temp/` is common), keep the existing name, the hooks accept both; `.ai_temp/` is the default for new installs. Also delete any `*:Zone.Identifier` artifacts under `.claude/` (Windows mark-of-the-web files created when the kit is copied from a Windows filesystem into WSL; they double the apparent file count and can break executable bits, mdd-notes3 3.3).
- On an existing `.mdd/`, run as gap analysis: add what is missing, propose removing what is unjustified, never overwrite user edits without showing the diff. Specifically diff the project's `.mdd/00-frontmatter-spec.md` against the kit's current template (`.claude/hooks/lib/templates/00-frontmatter-spec.md`): mdd-ensure never overwrites an existing spec, so semantic updates (like known_issues meaning active-only with a Fixed Issues section) otherwise never reach older projects. Show the diff, ask, then update.
- Global CLAUDE.md install (if approved), merge-never-overwrite:
  - No `~/.claude/CLAUDE.md`: copy `global/CLAUDE.md` there verbatim.
  - Exists WITHOUT the `<!-- mdd:global:begin` marker: append the kit block
    (blank line, then the whole marked block). Never touch the user's existing
    content.
  - Exists WITH the marker: diff the marked region against the kit's current
    block; if it differs, show the diff and ask before replacing ONLY the
    region between the markers. User edits outside the markers are never
    touched; user edits inside the markers are surfaced by the diff, never
    silently lost.

## Phase 5: Verify

Say: `[mdd-init 5/5] Verifying the install and running hook fixtures.`

Confirm every wired hook exists and is executable, every file parses, `CLAUDE.md`
is under its line budget, and nothing was installed beyond the approved plan.
Report three lists: installed (with the justifying evidence), skipped (with reason),
customized (what changed). Run `bash .claude/hooks/hooks/tests/run-all.sh`-style fixture
confirmation (`bash .claude/hooks/tests/run-all.sh`), and run the lsp-readiness check
directly (`bash .claude/hooks/lsp-readiness.sh`): it must print NOTHING, silence means
the LSP setup is whole (both halves) or deliberately absent (neither).

## Rules
- Never write or delete without confirmation. Propose, show, then apply.
- The plan table is the contract. Phase 4 applies exactly it, nothing more.
- Uncertain detection means ask, not guess.
