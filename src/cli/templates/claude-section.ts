export const SECTION_START_MARKER = '<!-- livestage-claude-integration -->'
export const SECTION_END_MARKER = '<!-- /livestage-claude-integration -->'

export const CLAUDE_MD_SECTION = `${SECTION_START_MARKER}

## LiveStage

LiveStage is a live-document format for this project: a \`.stage\` file mixes
prose with executable directives instead of static data. When you (or a
hook) read a \`.stage\` file, the engine resolves every directive and returns
pure markdown, no directive syntax left in it.

Only files with a \`.stage\` extension are ever parsed as LiveStage documents.
There is no header directive and no content sniffing: a \`.md\` file is always
plain markdown, never treated as a LiveStage document, no matter what it
contains.

### Reading .stage files

If the PreToolUse hook is installed (\`livestage init\`), reading a \`.stage\`
file with the normal Read tool already returns the fully rendered markdown,
directives resolved, nothing further to do. If the hook is not installed,
run \`livestage render <file>\` via the Bash tool first; the raw file on disk
contains unresolved directive syntax, not the content.

Do not convert existing \`.md\` files to \`.stage\` just to add directives to
them; \`.stage\` is a deliberate, separate extension for live documents.

### Writing .stage files

Directives are line-level: a directive must start its own line to be
recognized, it is not interpolated mid-sentence. Use \`{{ }}\` for inline
value interpolation instead.

Self-closing directives end the line with \` /\`: \`@list\`, \`@read\`,
\`@read-frontmatter\`, \`@tree\`, \`@count\`, \`@date\`, \`@env\`, \`@hash\`,
\`@query\`, \`@test\`, \`@check\`, \`@set\`, \`@render\`, \`@import\`, \`@include\`,
\`@template\`, \`@call\`, \`@assert\`, \`@update-frontmatter\`.

Block directives open on one line and close with \`@<name>-end\`: \`@define\`,
\`@if\`, \`@foreach\`, \`@switch\`, \`@data\`, \`@code\`.

Pipe syntax chains a source into filters and a sink on one line:
\`<source> | grep <pattern> | @render type="list" /\`. \`grep\`, \`sort\`,
\`head\`, \`tail\`, \`uniq\`, \`wc\` are built in and never spawn a process; any
other command goes through the project's shell allowlist.

Example:
\`\`\`
@foreach f in @list ./docs/ match="*.md"
@read-frontmatter path="./{{ f }}" field="status" /
@foreach-end

@if {{ args }}
Ran with: {{ args }}
@if-end
\`\`\`

Every directive is off by default until the project's \`.livestage/policy.json\`
grants it (shell commands, \`@code\` languages, HTTP, database access are all
deny-by-default). A document should still render sensibly with nothing
granted, since a passive hook read carries no arguments and the engine
fails open, never a crash.

${SECTION_END_MARKER}`
