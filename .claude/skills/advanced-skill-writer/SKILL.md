---
name: advanced-skill-writer
description: >
  Writes production-grade Claude Code skills with complete, currently-correct
  frontmatter, not just name and description. Also reviews a session that took
  heavy correction or research and judges whether it is worth encoding as a
  skill. Confirms every field against live Anthropic documentation before
  writing, since the spec adds fields between training cutoffs.
disable-model-invocation: true
user-invocable: true
context: fork
effort: high
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Bash(mkdir *)
  - Bash(python3 *)
  - WebFetch(domain:code.claude.com)
  - WebFetch(domain:docs.claude.com)
  - WebFetch(domain:agentskills.io)
  - WebFetch(domain:claude.com)
  - WebSearch
  - AskUserQuestion
---

# Advanced Skill Writer

Most skill authoring stops at `name` and `description` and calls it done. Every other
frontmatter field matters as much or more, they decide whether the skill runs isolated
or pollutes the main conversation, whether it stalls on permission prompts, whether a
forked version even has anything to act on. This skill gets all of it right, every
time, against the current spec rather than a memorized one. It authors every new MDD 2
skill.

Runs forked on purpose: researching the live docs and scanning existing skills
generates token-heavy page content that does not belong in the main conversation. Only
the finished skill and a short rationale come back. `$ARGUMENTS` carries the request in,
since a forked run has no access to anything said before it.

## Mode detection

**Forward mode.** The user describes a skill they want built. `$ARGUMENTS` is that
description. Go to Gate 0.

**Retrospective mode.** The user asks "how can we make this easier next time" or
"should we turn this into a skill" after a session with real back-and-forth,
corrections, dead ends. This is the actual point of skills, turning repeated mistakes
into something that works next time. Structural catch: this skill runs forked and has
zero conversation history, so the orchestrating Claude (still holding session context
when it triggers this) must do the extraction and pass it as `$ARGUMENTS`, not the
user's one-line question. The summary should cover what was attempted first, each
correction and why, what had to be researched, and the final correct approach.

**Judge before writing.** Not every corrected session deserves a skill. Decide
honestly: will this task recur, were there genuine non-obvious corrections worth
capturing, is the workflow involved enough that writing it down beats asking fresh. If
no, say so plainly and do not write one. If yes, the corrections become Gate 1's scope,
the skill's content should be those specific mistakes and fixes, not generic
instructions.

## Gate 0, confirm the live spec

Before writing a field, fetch the current spec. Do not skip even if confident, fields
get added between training cutoffs.
1. `web_search "Claude Code skills frontmatter reference"`. Do not trust a hardcoded URL, Anthropic's docs moved from docs.claude.com to code.claude.com once already.
2. Fetch the result and read the frontmatter reference table. As of writing it lives at `https://code.claude.com/docs/en/skills.md`, fetch it fresh every invocation.
3. If the skill touches an MCP server, also confirm `https://code.claude.com/docs/en/permissions.md` (the MCP section) for `mcp__<server>__<tool>` syntax, and the server's actual current tool list. Never guess tool names.
4. If the skill must work outside Claude Code, check `https://agentskills.io` for which fields are the base standard versus Claude Code extensions (`when_to_use`, `context`, `agent`, `hooks`, `paths`, `shell`, `effort` are Claude Code extensions).

## Gate 1, scope

If scope arrived via retrospective extraction, use it. Otherwise, if `$ARGUMENTS` does
not answer these, ask with AskUserQuestion: what it does concretely, what triggers it
(actual phrases), whether it has side effects, whether it touches an MCP server,
whether it should fire automatically, only on `/name`, or both.

## Gate 2, design the frontmatter

Work through every field, not just name/description.

- **context, fork or inline.** Default fork, it isolates heavy work from permanent context. Stay inline only when the skill injects reference knowledge the conversation keeps using. A forked skill with no actionable task returns nothing useful, the one exception.
- **If forking, wire the argument.** A forked subagent has zero history. Anything from context (a URL, filename, target) must arrive via `$ARGUMENTS` or a named `arguments:` entry. Skipping this is the most common way a forked skill silently does nothing.
- **agent.** Omit for general-purpose when the skill needs Write/Edit/Bash/MCP. `Explore` for pure read-only research, `Plan` for analysis that must not touch files.
- **allowed-tools, scope it.** Pre-approve what the skill needs so it does not stall on prompts. Scope WebFetch to domains, never bare. For MCP prefer the whole-server `mcp__servername` form, an allow rule for a non-existent tool name silently pre-approves nothing.
- **disable-model-invocation and user-invocable.** They control different axes: `disable-model-invocation: true` stops Claude auto-running it AND drops the description from context until invoked AND excludes it from subagent preload. `user-invocable: false` only hides it from the human `/` menu, Claude's access is untouched (the common misconception is that it locks Claude out, it does the opposite). For a command, or anything with real side effects: `disable-model-invocation: true` with `user-invocable: true` (set the second deliberately so a later reader can tell "command on purpose" from "nobody decided"). This is the MDD 2 default for every workflow mode.
- **description versus when_to_use.** description states what it does and the single most important trigger first. when_to_use carries the rest, specific phrases and an explicit "do NOT use for". Combined cap is 1,536 characters, front-load what matters.

## Gate 3, write it

- `SKILL.md`, required, under 500 lines. State what to do, not why, every line stays in context once invoked.
- `scripts/`, deterministic logic that should not be re-derived by prose; executes without loading into context until run.
- `references/`, detail needed only sometimes, loaded on demand. Do not put Anthropic's mutable spec here, that is Gate 0's job, fetch it live.
- `assets/`, templates used in output.

## Gate 4, validate

Run the bundled validator before presenting: `python3 ${CLAUDE_SKILL_DIR}/scripts/validate_skill.py path/to/new/SKILL.md`. It catches missing argument wiring on a forked skill, blown character budgets, oversized bodies, guessed MCP tool names. Fix every FAIL, use judgment on WARNINGS. (This validator is a companion script that ships with the skill under `scripts/`.)

## Gate 5, hand off

Present the finished skill with a short rationale table, every non-default choice
(context, agent, allowed-tools scope, disable-model-invocation) gets one line of why.
In retrospective mode, map each major body section back to the specific correction it
prevents. Then offer, do not run automatically, trigger/output testing via the official
`skill-creator` plugin's eval loop, and packaging if it is headed for distribution.
