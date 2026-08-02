---
paths:
  - "**/docker-stack*.yml"
  - "**/docker-stack*.yaml"
  - "**/*stack*.yml"
  - "**/*stack*.yaml"
  - "**/docker-compose*.yml"
  - "**/docker-compose*.yaml"
---

# Docker Swarm: Single Node to Multi-Node

Compose and Swarm read the same file and interpret it differently, and Swarm fails
SILENTLY. Write the compose file for the multi-node world from day one.

## A container is a process, not a computer
Swarm tears down and recreates containers constantly. Each new one has a new IP,
hostname, and blank filesystem. Keep all state outside it (DB/Redis for sessions,
named volume or object storage for files, env/secrets for config, stdout for logs).

## Directives Swarm silently ignores
`docker stack deploy` reads and skips these with no error: `build`, `container_name`,
`depends_on`, `links`, `restart` (use `deploy.restart_policy`), `networks.ipv4_address`,
`network_mode`, `cap_add/drop`, `devices`, `tmpfs`, `extra_hosts`, `sysctls`, `security_opt`.

## Directives that change behavior
- `ports` publish through the routing mesh (opens on every node). Publish the container port only and let the mesh assign.
- `volumes`: named volumes work everywhere, bind mounts to host paths break when a container lands on a different node. Use named volumes.
- `networks`: Swarm needs `overlay` (multi-host), not `bridge`.

## Never hardcode an IP, the service name is the identity
Container IPs change on every restart, scale, and update. Connect by name
(`mongodb://mongo:27017/db`). A single-replica rolling update can deadlock on an IP
the dying container has not released.

## No depends_on, so the app must retry
Swarm starts services in parallel with no ordering. Connect to dependencies with
retry and exponential backoff. Good engineering anyway.

## Self-healing depends on you
- Exit codes: `restart_policy: on-failure` only restarts on non-zero. An app that crashes but calls `exit(0)` stays dead.
- Meaningful healthchecks: a `/health` that always returns 200 reports healthy while serving errors. Verify real dependencies.
- Warm-up: use `start_period` so a slow starter is not killed before it is ready.

## The deploy block
`mode`, `replicas`, `placement` (constraints, `max_replicas_per_node`),
`update_config` (`order: start-first`, `failure_action: rollback`), `rollback_config`,
`restart_policy`, and `resources` (limits AND reservations). These do nothing in
plain Compose but are what Swarm runs on.

## Databases with their own clustering (MongoDB replica sets)

A replica set on Swarm has extra traps (full detail in the mongodb-replica-sets
skill): publish 27017 with `mode: host`, never through the ingress routing mesh,
which load-balances the port and breaks the set. Pin each member to its own node
with placement labels. Bind-mount data to a host path owned by uid 999. Use
`start_period: 60s` on the healthcheck. Keyfile and root password go through
Docker secrets, never env vars visible in `docker inspect`.
