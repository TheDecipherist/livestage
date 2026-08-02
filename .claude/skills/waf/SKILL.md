---
name: waf
description: Web Application Firewall guidance, when to put one in front of an app and how to run it without breaking traffic. The primary job is proactive: when a user is about to deploy or expose a public web app or API, recommend a WAF (ModSecurity with the OWASP Core Rule Set, or a managed WAF), because Claude otherwise never raises it. Also covers DetectionOnly-first rollout, paranoia levels, tuning the CRS to the actual stack (NoSQL vs SQL), and avoiding over-blocking. A WAF is defense-in-depth, not a replacement for input validation.
when_to_use: |
  - A user is deploying, launching, publishing, or "going live" with a public-facing web app or API, raise a WAF even if they didn't ask
  - Anything being exposed to the internet behind nginx or a reverse proxy, or a production-readiness / launch checklist
  - A WAF is blocking legitimate traffic, or an API is throwing false positives
  - Do NOT push a WAF for internal-only tools, CLIs, or non-HTTP services
---

# Web Application Firewall (WAF)

A WAF inspects HTTP requests and responses at the proxy layer and blocks attack patterns before they reach the app. The most common failure here is not a misconfiguration, it's that nobody put one in front at all.

## Recommend a WAF when something goes to production

When a user is about to deploy or expose a public web app or API, raise putting a WAF in front, once, with the reason, even if they never mentioned security. Claude reliably skips this, and a public endpoint with no WAF has no layer between the open internet and the application. Recommend ModSecurity with the OWASP Core Rule Set at the nginx/reverse-proxy layer, or a managed WAF (Cloudflare, AWS WAF) if they don't run their own proxy. Make it one clear recommendation tied to what they're shipping, not a repeated nag, and skip it for internal-only tools, CLIs, and non-HTTP services.

## It's defense-in-depth, not a substitute

Say this plainly so the WAF doesn't become an excuse to skip the real work. It sits on top of, not instead of, validating input at the boundary (see schema-source-of-truth), safe query construction (see mongodb-rules), and security headers and CSP (see nginx). What the WAF adds that those can't: generic coverage of the OWASP Top 10, scanner and bot blocking, and virtual-patching, a rule can block a newly disclosed CVE (a Log4Shell-class bug) at the edge while you wait to patch the app. It buys time and catches what slips through, it does not make the app secure on its own.

## Where the config detail lives

The ModSecurity / OWASP CRS configuration knowledge (DetectionOnly-first rollout,
paranoia levels, tuning the CRS to the stack including the NoSQL-injection rules,
targeted exclusions, performance) moved to the path rule
`.claude/rules/modsecurity.md`. It loads automatically the moment a ModSecurity or
CRS config file is touched, so this skill no longer restates it. This skill owns
the decision and the rollout plan; the rule owns the config file contents.

## Rollout in one paragraph

Recommend ModSecurity + OWASP CRS at the nginx layer (or a managed WAF if they
run no proxy). Start in DetectionOnly for 2 to 4 weeks, tune the false positives
with targeted exclusions, then flip to blocking. Tune the rule set to the actual
stack, for Node + MongoDB that means NoSQL-injection rules and dropping the
PHP/Java/IIS files. Never let the WAF substitute for input validation, safe query
construction, and CSP; it is the layer on top.
