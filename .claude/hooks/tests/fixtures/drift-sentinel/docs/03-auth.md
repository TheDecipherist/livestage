---
id: "03-auth"
title: "User authentication"
source_files: ["src/auth.ts", "src/adapters/auth.repository.ts"]
routes: ["POST /api/v1/login", "POST /api/v1/logout"]
models: ["User", "Session"]
test_files: ["tests/auth.test.ts"]
status: "active"
phase: "done"
last_synced: "2026-07-04"
tags: ["auth", "security"]
---

# User authentication

Controls login and session handling. This fixture doc exists so the drift
sentinel has a real frontmatter reference to match against.
