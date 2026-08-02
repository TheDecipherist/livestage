---
name: seo-audit
description: >
  Full technical SEO and LLM-readability audit for any URL. Runs live browser
  DOM inspection via the Playwright MCP server, covering both traditional SEO
  fundamentals and 2026 LLM/GEO optimization signals: Core Web Vitals, schema
  markup, semantic HTML, heading structure, meta tags, performance, and
  crawlability.
disable-model-invocation: true
user-invocable: true
argument-hint: "[url]"
arguments: [url]
context: fork
allowed-tools: "Read, Write, WebFetch, mcp__playwright"
---

# SEO Audit Skill

Performs a comprehensive technical SEO and LLM-readability audit on a given URL
using live browser DOM inspection via the Playwright MCP server (`@playwright/mcp`).

Requires the `playwright` MCP server and this skill's companion `references/checks.md`
(the 26 checks with exact JavaScript snippets). Add the MCP server at project scope:

```json
// .mcp.json
{
  "mcpServers": {
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest", "--headless"] }
  }
}
```

## How to invoke

The user provides a URL. Run the full audit against it. Output findings as a clean
markdown report grouped by severity.

## Step 1, Setup

Load the reference file before starting:
> Read `references/checks.md`, it contains all 26 checks with exact JavaScript
> snippets. Do NOT rely on memory for the JS. Copy it verbatim from the reference.

Then navigate to the URL with Playwright: `browser_navigate (url: $url)`, then
`browser_wait_for` page load complete (confirm via `browser_evaluate`:
`document.readyState === 'complete'`).

## Step 2, Run the checks

Execute in this order, grouping by category (run all JS in a category before the next):

- **A, Identity and Indexing** (1-5, 21): title, H1 outerHTML (spans, ad copy), full heading hierarchy h1-h5, all meta tags, canonical, robots.txt (fetch [domain]/robots.txt separately).
- **B, Structured Data** (6, 22-23): JSON-LD schema count and types, FAQ structure, content-chunk extractability (H2/H3 followed by a self-contained P).
- **C, Content Semantics** (7-10, 18-20): image alt audit, link audit, heading-to-paragraph DOM association, P vs SPAN census, semantic landmarks, nav link quality, article metadata.
- **D, Accessibility, E-E-A-T and LLM Signals** (21, 24-26): accessibility is LLM citability, LLMs parse pages like screen readers, so landmarks, heading hierarchy, alt text, and button labels are shared signals. Plus E-E-A-T (authors, dates, citations), social cross-indexing, AI-bot monitoring (server-level, flag manual).
- **E, Performance and Security** (11-16, 27): reload BEFORE console checks. Navigation timing (TTFB, DCL, load), script and third-party count, HTTP protocol versions, preloads, console errors (React hydration #418/#423 etc.), CDN cache status, resource breakdown, security headers (CSP, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy), Cache-Control TTL.
- **F, Architecture** (17): cross-page internal linking.

## Step 3, Severity

P0 BLOCKER (prevents indexing or active errors), P1 CRITICAL (major ranking/security/LLM impact), P2 HIGH (clear signal degradation), P3 MEDIUM (LLM/GEO gaps), P4 LOW (quick wins).

## Step 4, Output

A markdown report: title/URL/date, a 3-5 sentence summary with the single most
important fix, findings grouped P0 to P4, a "What Google Most Likely Ranks This Page
For" section based on the actual signals found, and "Prerequisites Before SEO Content
Optimization" (if P0/P1 exist, content work has limited impact until they are fixed).

## Step 5, Save

Save as `seo-audit-[domain]-[date].md` in the working directory.

## Notes

- Never guess JS output, always run the snippet from `references/checks.md` through `browser_evaluate`.
- Pull console errors with `browser_console_messages`, timing/resources with `browser_network_requests`. `browser_snapshot` returns the accessibility tree directly, prefer it for landmark/heading/label checks.
- Console errors need a page reload before capture. robots.txt is always a manual fetch.
- If the `playwright` MCP server is not connected, fall back to web_fetch for meta tags and visible content, note which DOM-level checks could not run, and flag them for re-run.
