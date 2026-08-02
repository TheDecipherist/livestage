---
paths:
  - "**/Dockerfile"
  - "**/Dockerfile.*"
  - "**/*.Dockerfile"
  - "**/docker-compose*.yml"
  - "**/docker-compose*.yaml"
  - "**/compose*.yml"
  - "**/compose*.yaml"
conformance:
  - "docker-no-latest-base :: absent :: **/Dockerfile* :: FROM [^ ]+:latest"
  - "docker-nonroot-user :: contains-if-present :: **/Dockerfile :: USER "
---

# Docker: Production Image and Compose Rules

From production, not defaults. Claude's Dockerfiles tend to be wrong the same few ways.

## Dockerfile
- Multi-stage builds, always. Build in a stage with the compilers, then `COPY --from=build` only the artifacts into a slim runtime. Cuts size hard and removes CVEs.
- Order layers stable-first, source last. Copy the dependency manifest and install BEFORE copying source, or a one-line code change reinstalls every dependency.
- The runtime command is `ENTRYPOINT`/`CMD` in EXEC form (a JSON array), never shell form. Shell form runs your app under `sh -c`, so sh is PID 1, swallows SIGTERM, and your app never shuts down gracefully or reports its exit code.
- Pin base image versions (`node:22.3.0-slim`, not `latest`).
- Add a `.dockerignore` (node_modules, .git, .env, dist).
- Run as non-root: add a `USER` before the entrypoint.
- Add a `HEALTHCHECK`, it is what makes rolling updates and rollback work.
- Combine `apt-get update && install && rm -rf /var/lib/apt/lists/*` in one RUN.

## Compose
- `init: true` on every service (tini as PID 1, forwards signals, reaps zombies). The one always missed.
- Set resource `limits` AND `reservations`.
- Configure `update_config` with `failure_action: rollback`, paired with a HEALTHCHECK.
- Reference services by name, never by IP. Container IPs change on every restart.
- Substitute env with defaults: `image: registry/app:${BUILD_VERSION:-latest}`.

## Secrets and config
- Never bake secrets into the image. ARG/ENV values live in image layers and show in `docker history`. Use BuildKit build secrets at build time, Docker secrets or runtime env at run time.
- Docker `secret` for certs/keys/passwords (encrypted), Docker `config` for non-sensitive files. Neither goes in the image.
- Log to stdout/stderr, not to files inside the container.
