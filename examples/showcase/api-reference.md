# CLI Reference

LiveStage has no HTTP API; the CLI verb table is its interface, and this
table is itself generated from `cli-reference.json` rather than
hand-maintained, the same principle every other document in this showcase
demonstrates.

| verb     | purpose                                                      | writes |
|----------|--------------------------------------------------------------|--------|
| render   | Render a .stage document to markdown                         | no     |
| validate | Check structure and semantics without running it             | no     |
| assert   | Run every @assert as a CI gate, exit 1 on any failure        | no     |
| strip    | Emit the degraded static twin of a document                  | no     |
| doctor   | One-line health check: policy, trace, assertion liveness     | no     |
| init     | Register the PreToolUse hook and seed .livestage/policy.json | yes    |
| cache    | Show or clear the session/persist directive cache            | yes    |
| security | Test a shell command or path against the active policy       | no     |
| watch    | Warm the render cache in the background, never a server      | yes    |

`writes: yes` means the verb touches disk (`.livestage/cache/`,
`.livestage/policy.json`, hook registration); every other verb is read-only.
