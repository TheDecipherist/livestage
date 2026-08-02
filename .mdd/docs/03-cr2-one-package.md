---
id: 03-cr2-one-package
title: "CR-2: One Package"
type: SPEC
path: Contracts / One Package
source_files: []
status: complete
phase: all
last_synced: 2026-08-01
initiative: livestage
wave: livestage-wave-1
depends_on: []
tags: [contract, package-layout, no-workspaces, ci-scan, version-skew]
known_issues: []
---

# CR-2: One Package

## What to Build

A behavior contract: exactly one root `package.json` defines the publishable
unit; no workspace configuration exists anywhere in the repo. Verified by a
scan.

## Architecture

Directly shapes feature 07 (Package Skeleton): there is one `package.json` at
repo root, not a `packages/*` monorepo layout like the donor. This is the
single biggest structural break from the donor codebase.

## Implementation Notes

The donor was itself the site of "the worst environmental incident" from
version skew across multiple packages (spec line 74-75); this contract is the
direct fix, not an arbitrary preference. One version, one publish, one install
line.

## Data Model

N/A.

## API/Interface

N/A. Satisfied by feature 42's scan.

## Business Rules

1. Exactly one root `package.json` defines the publishable unit (line 717).
2. No workspace configuration exists (line 717-718).

## Acceptance Criteria

- [x] Scan finds exactly one `package.json` that declares dependencies/scripts
      for the shipped package (fixture `package.json`s under `tests/` are not
      the publishable unit and are excluded from the count). Verified: only
      `./package.json` exists outside `node_modules/`.
- [x] No `workspaces` field, `pnpm-workspace.yaml`, `lerna.json`, or
      equivalent exists. Verified.

## Dependencies

None.

## Known Issues

None.
