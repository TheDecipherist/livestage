---
name: rules-for
description: Answer "which rules govern this file, and do they pass" for any path in the project. Shows every rule whose paths globs match the file, each of that rule's conformance specs evaluated live (PASS / FAIL / VACUOUS-PASS with the reason), and flags a file that no rule matches at all. Invoke with /rules-for followed by the file path.
disable-model-invocation: true
user-invocable: true
argument-hint: "[file path]"
arguments: [file]
allowed-tools: "Bash(node .claude/hooks/lib/*), Read"
---

Answer the question for: $file

1. Run `node .claude/hooks/lib/conformance-gen.cjs --rules-for "$file"` and show
   its output verbatim. It lists each matching rule with the glob that matched
   it, and evaluates every spec live against the working tree.
2. Interpret the three states for the user in one line each where they matter:
   FAIL names the violating file or the vacuous glob; VACUOUS-PASS on an
   `absent` spec is fine (no file, no violation); a FAIL reading "glob matches
   nothing" means the spec's target does not exist in this layout, which is a
   rule-delivery problem, not a code problem.
3. If the output says NO RULES match: that is the finding, not a blank. An
   entry point, data adapter, or route file matching zero rules means the
   rules never reach the agent when this file is edited. Offer to widen an
   existing rule's `paths:` or add a rule, and name which rule is closest.
4. For matched rules WITHOUT specs, remind the user those rules are advisory
   text only: followed at build time, unverifiable afterward. `/conformance`
   plus `--doctor` shows the project-wide version of this picture.

## Messaging

Print one plain `[rules-for] <file>` line when starting, then the results. End
with a one-line verdict: "N rules govern this file, M specs pass, K fail" (or
the zero-rules finding). No status bar mirror needed, this is instant.
