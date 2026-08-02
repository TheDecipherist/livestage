---
paths:
  - "**/nginx.conf"
  - "**/*.nginx.conf"
  - "**/nginx/**"
---

# NGINX: Production Reverse-Proxy Config

Aimed at NGINX in front of containerized backends. The defaults are fine for a
static site, these are the things that bite in production.

## Resolve upstreams through Docker DNS with a short TTL
By default NGINX resolves an upstream once at startup and caches the IP forever. In
Docker that IP belongs to a container that will be replaced, so the proxy sends
traffic to a dead address. Force re-resolution:
```
http { resolver 127.0.0.11 ipv6=off valid=10s; }
```

## Upstreams by service name, with keepalive
Reference backends by service name, never IP. Reuse connections with `keepalive`,
which needs HTTP/1.1 and a cleared Connection header (`proxy_http_version 1.1;
proxy_set_header Connection "";`).

## Structured JSON logs to stdout/stderr
Log JSON so an aggregator can parse it, to `/dev/stdout` so Docker's driver captures
it. Never log to a file inside the container.

## Health and status on separate, access-restricted ports
Keep `/health` and `stub_status` off the production port, on internal-only ports
with `access_log off` and `allow`/`deny`.

## Stream blocks go OUTSIDE the http block
Proxying a non-HTTP protocol (MongoDB, a database) uses the top-level `stream`
block, not inside `http`. Putting it inside `http` is a silent misconfiguration.

## SSL and security headers
Modern protocols/ciphers, session cache, OCSP stapling. Certs from Docker secrets
mount at `/run/secrets/`. Send security headers with `always` so they are present on
error responses too (X-Frame-Options, X-Content-Type-Options, HSTS).

## Public exposure: consider a WAF
Fronting a public app or API? Consider a WAF layer (ModSecurity + OWASP CRS, or
a managed WAF) as defense-in-depth, DetectionOnly first. The `waf` skill owns the
recommendation and rollout; the modsecurity rule (`.claude/rules/modsecurity.md`)
loads automatically on ModSecurity/CRS config files with the tuning detail.

## Always add a Content-Security-Policy
The highest-value security header and the one almost always left out. Set the
directives explicitly (not just `default-src 'self'`), avoid `'unsafe-inline'` and
`'unsafe-eval'`, set `object-src 'none'` and `base-uri 'self'`, use `frame-ancestors`
for clickjacking. Roll out with `Content-Security-Policy-Report-Only` first, tune,
then enforce.

## Watch line endings
NGINX config with Windows CRLF can fail to parse in a Linux container. If `nginx -t`
reports something nonsensical, check line endings first.
