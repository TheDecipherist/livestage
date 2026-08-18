# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/); this file starts
at 1.0.2, the first version documented this way.

## 1.1.1

### Changed

- **README.md rewritten**: leads with what an agent's re-derived-every-session
  token cost actually looks like (a measured round-trip table in
  `benchmarks/roundtrip.json`), states plainly when to reach for LiveStage
  and when not to, and moves the full directive reference out to its own
  page.
- **New: `docs/directives.md`**, generated from `directives.stage` the same
  way `README.md` and `CLAUDE.md` generate themselves
  (`npm run directives` / `npm run directives:check`, wired into CI). The
  directive reference used to live inline in the README; it now has room
  to be exhaustive without crowding out the README's own pitch.
- No runtime (`dist/`) changes in this release, README and repository
  tooling only.

## 1.1.0

### Added

- **The generated-`.md` contract**: `livestage build ... --stamp-metadata
  [--hash-inputs="glob,glob"]` writes a `livestage:generated` HTML comment
  block (not YAML frontmatter, deliberately, GitHub renders a leading
  `---` block ugly at the top of a repo's own README) naming the `.stage`
  source, when it was rendered, which version rendered it, and a content
  hash over the render's declared inputs.
- The installed **PostToolUse** hook now also watches reads of any `.md`
  carrying that block, not only `.stage` files. It hashes the declared
  inputs before doing any work; unchanged means the committed file is
  served with zero render. On a changed hash, the user-set
  `livestage_regenerate_on_read` field decides what's served: absent
  serves the committed file with a stale-drift notice and the exact regen
  command, `true` serves a fresh render with a notice naming the source,
  `false` serves the committed file silently (an explicit opt-out). A
  render that fails or times out always serves the committed file with a
  could-not-verify notice; a read through this hook never fails and never
  serves a fresh render silently, at any setting.
- New public exports from `livestage/engine`: `parseGeneratedMetadata`,
  `extractGeneratedMetadataBlock`, `stripGeneratedMetadataBlock`,
  `stampGeneratedMetadata`, `recomputeContentHash`.

## 1.0.2

### Security

**Fixed:** `checkShellCommand`'s allowlist did not check a compound shell
command per subcommand. `matchShellPattern`'s wildcard-to-regex conversion
(`'git *'` -> `/^git .*$/`) matches shell metacharacters (`;`, `&&`,
`||`, `|`) the same as any other character, so a chained command riding
on an allowed prefix passed the allowlist as one whole-string match.
Concretely: `matchShellPattern('git *', 'git status && rm -rf /tmp/x')`
returned `true`. A `.stage` document containing a literal, non-interpolated
`@query` command with a chained destructive command (for example
`@query "git status && rm -rf /tmp/x" /`) would reach a real shell if the
project's policy allowed any prefix of it, such as `git *`.

This is distinct from, and was not fixed by, an earlier interpolation-only
fix in the same area: that one closed the route where an *interpolated
value* ({{ }}, macro substitution) could smuggle a chained command into an
otherwise-safe static command string. It explicitly left the allowlist
matcher itself unchanged. The gap fixed here is the matcher checking a
literal, statically-authored compound command as a single string instead
of validating each subcommand independently, reachable by any `.stage`
file whose own source (not an interpolated value) contains a chain, most
notably a malicious `.stage` file arriving via `git clone` alongside a
permissive committed `.livestage/policy.json`.

**Affected versions:** 1.0.0, 1.0.1.

**Fix:** `checkShellCommand` now splits a command on `&&`, `||`, `;`, and
a single `|` (quote-aware: an operator character inside a quoted string,
or preceded by a backslash, is never treated as a chain boundary) and
checks every subcommand independently through the same allowlist/deny/
immutable-block logic, denying on the first subcommand that fails. A
simple, non-chained command is unaffected. Matches the per-subcommand
model Claude Code's own permission matcher uses. No configuration change
required; upgrading closes the gap.

### Security (workspace trust)

A `.livestage/policy.json` arriving with a `git clone` previously granted
`shell`/`code`/`http` at render time regardless of whether the user had
reviewed it, since the render hook spawns with `--cwd
dirname(filePath)`, the policy sitting next to the file is the one that
applies. `loadSecurityConfig` now requires the directory a real
policy.json governs to be explicitly trusted (`livestage trust <dir>`,
recorded in `~/.livestage/trust.json`, never inferred or auto-granted)
before its `shell`/`code`/`http` grants take effect; `deny_patterns` and
the immutable always-block rules apply regardless of trust, since they
only restrict. A project with no policy file at all is unaffected (the
shipped default is not a file an attacker could have planted). Mirrors
Claude Code's own project-settings trust model.

### Added

- **`@import-graph src="./some/dir" [tsconfig="./tsconfig.json"]`**: a new
  directive that walks a source tree and emits a Mermaid dependency graph
  of its internal module imports, filesystem-read only (no shell or
  `@code` grant needed, unlike the `@code`-under-policy pattern this
  replaces in `examples/import-graph/`). Resolves `tsconfig.json`
  `compilerOptions.paths` aliases generically (read live, not hardcoded);
  `tsconfig=` points at a config file explicitly (any name or location),
  or it auto-discovers one by walking up from `src=`.
- **`livestage trust [dir]`**: a new CLI verb (with `--list`/`--remove`)
  for the workspace-trust store above.
- **`livestage init --seed-from-permissions`**: derives suggested
  `shell.allow_patterns` from the caller's Claude Code settings.json
  `permissions.allow` Bash rules and prints them before writing, instead
  of the empty strict-profile default.
- **`livestage render --home-dir <path>`**: overrides the home directory
  used to resolve the workspace-trust store (testing/automation only; a
  real render always uses the real user's real trust store by default).

### Changed

- `livestage init` now seeds a genuinely strict policy profile (shell
  off, no patterns granted) instead of a permissive ~44-pattern default
  that contradicted its own "seeds the strict profile" documentation.
- The render-substitution hook is now registered under Claude Code's
  `PostToolUse` event (was incorrectly registered under `PreToolUse`,
  which cannot substitute a Read call's returned content at all; a live
  session previously got the raw, unrendered `.stage` source back).
- `examples/drift/test-coverage-map/`'s headline example now computes the
  actual set difference (source files with no matching test) instead of
  listing both directories for the reader to cross-reference by eye. The
  old side-by-side version is kept as
  `test-coverage-map-side-by-side.stage` for contrast.
- Every example under `examples/drift/` now ships a `-terse` companion
  (directives only, no teaching prose) beside its annotated version.
