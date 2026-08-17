# Onboarding Brief

The old way: `cat README.md`, `cat package.json`, `ls src`, `grep scripts
package.json`, four separate commands before an agent (or a new
contributor) has any real picture of what a project even is.

The new way: one render. This example needs no shell grant at all, no
`.livestage/policy.json` beyond the shared one in this directory (which
this file doesn't even use): `@read` and `@tree` are filesystem-policy
directives, not shell.

## Result

Runs against a small, self-contained fixture project
(`sample-project/`) alongside this file, so the pattern is reusable in any
project without a path escaping this example's own directory.


## Onboarding Brief: sample-project

A minimal fixture project, illustrating the onboarding-brief pattern only, not a real published package.

### Source tree
├── index.ts
└── utils.ts
