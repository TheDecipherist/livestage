---
name: connect
description: Force a full rebuild of the MDD connections map (.mdd/connections.md). Normally the connections-sync hook keeps it current automatically on every doc change, so use this only for an explicit on-demand rebuild or to check the warnings. Invoke with /connect.
disable-model-invocation: true
user-invocable: true
allowed-tools: "Bash"
---

Run `node .claude/hooks/lib/mdd-ensure.cjs` first, before anything else. It creates `.mdd` and its essential files if missing, and is a silent no-op otherwise.

Force-regenerate `.mdd/connections.md` by running the deterministic generator:

```
node .claude/hooks/lib/connections-gen.cjs
```

That is the single source of the map. It reads every `.mdd/docs/*.md` frontmatter
(never bodies, never archive) and writes the path tree, the Mermaid dependency graph,
the source-file overlap, and the structural warnings (broken and circular depends_on,
docs missing a `path`). It prints the warning count.

You usually will not need this. The `connections-sync` hook runs the same generator
automatically whenever a doc is written, moved, or at session start, so the map stays
current without anyone remembering to rebuild it. Reach for `/connect` only to force
a rebuild on demand, or when you want to read the warnings directly. After running,
report the doc count, edge count, and any warnings from the regenerated file.

## Messaging

Print one plain `[connect] <what is happening>` line when starting (and at each later
stage of this flow), then work silently. Any question to the user is a
`WAITING ON YOU` block with numbered options, never an open-ended stop. End with a
short DONE line: what was produced, the key numbers, and the natural next action
(or `BLOCKED, <reason>` with numbered options).
Mirror the steps to the status bar: run `node .claude/hooks/lib/statusbar.cjs set connect <step> <total> "<label>"` alongside each line and `node .claude/hooks/lib/statusbar.cjs done connect` with the DONE line (pre-approved, best-effort, silent).
