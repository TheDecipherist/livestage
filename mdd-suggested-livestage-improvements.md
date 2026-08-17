# Where LiveStage could improve MDD itself

Research notes from reading through `.mdd/`, the hooks/skills that generate
its derived files, and the feature-doc corpus, looking for the same class
of drift LiveStage exists to eliminate everywhere else in this project.
Nothing here has been built; this is the research, not the build.

Two separate questions, both covered below:
1. Could LiveStage replace or improve pieces of MDD's own tooling?
2. Could the feature docs in `.mdd/docs/` themselves benefit from LiveStage,
   in their frontmatter or in how they describe code?

## Part 1: MDD tooling opportunities

### 1a. `.mdd/connections.md`, the strongest match, almost a direct swap

Generated today by `.claude/hooks/lib/connections-gen.cjs` (186 lines of
hand-rolled Node), triggered by `connections-sync.sh` on every doc write.
Its own top comment states the LiveStage pitch without knowing it:

> "This is a pure function of the frontmatter, which is exactly why it
> belongs in a script a hook can run rather than in a skill that must
> remember to."

`examples/connections/connections.stage`, built earlier this session, is a
working proof that this exact output shape (path tree, Mermaid dependency
graph, broken-`depends_on` detection, source-file overlap) already renders
correctly from a real `.stage` file using `@list` plus `@render tree`,
`@graph`, and one `@code` script for the overlap pass. A
`.mdd/connections.stage` could replace the `.cjs` script's core logic
entirely; the hook would call `livestage build` instead of
`node connections-gen.cjs`.

**Risk**: low. The example already proves the pattern on a real doc corpus,
not just a fixture.

### 1b. `.mdd/.startup.md`'s auto-generated zone, the highest-leverage one

This is not a script, it's a prompt. Every `/status` invocation, a whole
Claude session re-derives doc counts, splits `known_issues` into
`[gap]`/`[deferred]` by grep, checks every file for over 300 lines, counts
initiatives/waves by status, and walks `git log` per doc for drift, via a
live sequence of Bash/Grep/Read tool calls guided by prose instructions
(`.claude/skills/status/SKILL.md`). That is tokens and latency spent, every
single time, on work that is almost entirely deterministic:

| Currently (LLM re-derives via tool calls, every `/status` run) | Directive that replaces it |
|---|---|
| Doc count in `.mdd/docs/` | `@count ".mdd/docs" match="*.md"` |
| "Features Documented" sorted list | `@list ".mdd/docs/*.md" fields="id,status,tags"` (the same pattern `README.stage`'s own directive-reference section already uses) |
| Waves/initiatives by status | `@list ".mdd/waves/*.md" where="status=='complete'"`, clean YAML frontmatter, no grep needed |
| `[gap]` vs `[deferred]` counts | `@query` grep, or the `count-by` pipe builtin |
| Connections freshness (`generated:` vs newest `last_synced`) | `@read-frontmatter` plus `@if` |
| Quality gate (files over 300 lines) | `@query "find src -name '*.ts' \| xargs wc -l"` |

The `git log`-per-doc drift check genuinely needs shell, so that piece
stays a `@query`, still LiveStage-native, just not filesystem-only.

This would not eliminate `/status` as a skill: deciding what to headline,
when to warn, how to phrase the block is real judgment, not data. But it
would eliminate almost all of the data-gathering, which is most of what
currently costs time and tokens on every call.

**Risk**: medium. Touches a core, frequently-used skill; worth a deliberate
design pass rather than a quick swap.

### 1c. Open-issues visibility, project-wide

This session alone, `[gap]`/B-number lookups across `.mdd/docs/` were
hand-grepped repeatedly: checking for an existing B-number before recording
a new bug, auditing what was still open before closing a doc. A small
`.mdd/open-issues.stage` (`@list` plus `where=`, rendered as a table) would
make that a permanent, always-current artifact instead of an ad-hoc grep
re-run by hand every time.

**Risk**: low. Pure read, no existing mechanism to replace or conflict with.

### What should stay as-is

- `.mdd/audits/flow-*.md`: genuine authored analysis, not computed facts.
- `.state.json`, `.statusbar.json`, `.status-activity.json`: high-frequency
  mutable session state. LiveStage's model is pure reads plus one sanctioned
  write (`@update-frontmatter`); this is a poor fit for incremental,
  many-times-per-run state tracking.
- The skill `.md` files themselves: instructions for Claude, not data to
  render.

## Part 2: Could the feature docs themselves use LiveStage?

Yes, and this section originally undersold it. The first draft of this
document argued docs should not become `.stage` sources because "every
tool assumes `.md`." That reasoning does not hold up: it missed that the
output can stay exactly `.md`, the same relationship `README.stage` already
has to `README.md`, and `CLAUDE.stage` to `CLAUDE.md`. A `docid.stage`
source generating the committed `docid.md` means every downstream
consumer, `frontmatter-validate.cjs`, `connections-gen.cjs`, doc-discovery
globs, every build/bug/task skill, needs zero changes: they would still be
reading a plain `.md` file with plain YAML frontmatter, exactly as they do
today.

### The real tradeoff is workflow fit, not tooling compatibility

`README.stage`/`CLAUDE.stage` are regenerated occasionally. Feature docs
are edited constantly, by every build/bug/task skill, at nearly every
phase. Converting the corpus would mean teaching every skill "edit the
`.stage` source, then run `livestage build`" instead of "edit the `.md`
directly." That is close to zero added cost for an agent following scripted
skill steps (this whole corpus is already agent-authored, not
hand-typed by a person clicking around), which is the actual, correct
reason this is more feasible than the first draft credited.

### The stronger design this makes possible

A `.stage` source is not just less drift-prone than a hand-typed `.md`,
it can refuse to regenerate when its own claims about the code go stale.
Embed `@assert`/`@query` checks for `source_files`/`test_files` existence
and Acceptance-Criteria test-name citations directly in the doc's own
`.stage` source, and `livestage build` fails, or clearly flags, the moment
someone regenerates a doc whose claims no longer hold, at generation time,
not via a separate audit tool checked after the fact. That is a stronger
guarantee than the standing-report idea below, which only surfaces drift
after it has already happened.

### Where the real drift lives today: frontmatter

`source_files`/`test_files` were the single most common thing that went
stale this session, found and fixed by hand at least half a dozen times
(10-security-policy-core, 18-compute-directives, 19-composition-directives,
20-render-formats, 22-pipe, all had missing or empty `test_files`). The
`frontmatter-validate.cjs` hook already does real, useful work here at
write time: it checks that `source_files`/`test_files` entries exist on
disk, blocks a `status: complete` doc from shipping with empty
`test_files`, and warns when a doc's body cites a test file not listed in
`test_files` (`frontmatter-validate.cjs:116-180`).

The gap is what that hook cannot do: it only fires when a doc is edited. It
catches "this field is wrong right now, as I write it." It cannot catch
"this field was correct when written, and drifted later" (a source file
got renamed, a test got deleted, months after the doc's last edit),
because nothing re-checks a doc that nobody is currently touching. A
`.mdd/frontmatter-audit.stage` could run the same existence checks as a
standing, browsable report across the whole corpus, not just at edit time:
`@list`/`@read-frontmatter` every doc's `source_files`/`test_files`,
cross-check each path against the real filesystem, flag anything stale,
all without requiring anyone to open and re-save the doc first.

### Where the real drift lives: how docs describe code

Two concrete, measured patterns, both citation-shaped, both currently
trusted rather than verified:

- **47 of 52 docs** cite spec line numbers, "(line 335)" style, referencing
  `.mdd/specs/livestage-spec.md`. Low practical drift risk (the spec is a
  frozen, imported snapshot), but still a hand-typed fact with no
  verification that the cited line still says what the doc claims.
- **15 docs** cite exact test names in their Acceptance Criteria, in the
  `file.test.ts::"test name"` format. These genuinely drift: a renamed test
  silently breaks the citation, and nothing currently checks that the named
  test still exists with that exact name in that exact file. This is the
  same class of fact the `frontmatter-validate` hook already polices for
  the `test_files` field but not for prose citations inside the doc body
  pointing at a specific test name.

The pattern behind both: an agent reading a feature doc before touching it
does not take these citations on faith, it re-verifies them by grep, every
time (as this session did, constantly). That is exactly the "Claude
computes what LiveStage could have already computed" waste the whole
project exists to close. Either shape below (a separate verifier reading
the docs as data, or the docs becoming `.stage` sources themselves) closes
it; the two options below differ in cost and strength, not in whether the
problem is solvable.

### Two shapes this could take, both real options

**A, standalone verifier (lower risk, smaller win).** A small number of
`.stage` documents, sitting alongside the corpus, that read the docs as
plain data (`@read-frontmatter`, `@list ... where=`) and cross-check their
claims against the real repository, the same trust boundary
`examples/connections/connections.stage` already draws between "the
fixture corpus" (data) and "the `.stage` file that reports on it"
(computation). Docs stay untouched; nothing about how they are authored or
edited changes. Drift is caught after the fact, whenever the verifier is
run.

**B, doc corpus becomes `docid.stage` sources generating `docid.md`
(higher effort, stronger guarantee).** Every build/bug/task skill edits the
`.stage` source and runs `livestage build` instead of editing `.md`
directly. `frontmatter-validate.cjs` and every other downstream tool are
unaffected, they still read the generated `.md`. The real cost is
retrofitting every MDD skill's doc-writing steps, and deciding how much of
each doc becomes computed (just the fact-shaped fields, or the full
document); the real payoff is a doc that cannot regenerate while lying
about the code.

B is the better long-term answer if this is worth doing at all; A is the
smaller, reversible first step that proves the value before committing to
retrofitting every skill.

## Priority if picking one to build first

1. `.mdd/connections.md` replacement (1a), lowest risk, already proven.
2. Frontmatter/citation verifier, shape A above, directly closes a pattern
   that cost real time this session, repeatedly, with no skill retrofit.
3. `.mdd/.startup.md` auto-generated zone (1b), highest leverage, but
   touches a frequently-used skill; wants a deliberate design pass.
4. Open-issues report (1c), low risk, smaller win, good complement to #2.
5. Doc corpus conversion, shape B above: the biggest structural change
   here, worth revisiting once A has proven the pattern's value and the
   skill retrofit cost has been scoped for real.
