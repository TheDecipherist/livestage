---
paths:
  - "**/modsecurity.conf"
  - "**/modsecurity.d/**"
  - "**/modsec*/**"
  - "**/crs-setup.conf"
  - "**/*.modsec.conf"
  - "**/owasp-crs/**"
  - "**/REQUEST-*.conf"
  - "**/RESPONSE-*.conf"
---

# ModSecurity / OWASP CRS configuration rules

For writing or tuning ModSecurity and Core Rule Set config. The decision of
WHETHER to put a WAF in front of an app lives in the `waf` skill; this rule is
the how, loaded only when a ModSecurity file is actually being touched.

## Deploy in DetectionOnly first, then block

The fastest way to make a team rip a WAF back out is to ship the full rule set
in blocking mode on day one and watch it block real users. Start in log-only
mode, watch the audit log for a couple of weeks, write exclusions for the false
positives, then switch to blocking.

```
SecRuleEngine DetectionOnly   # log, don't block, for the first 2-4 weeks
# SecRuleEngine On            # flip to blocking only after tuning
```

## Start at low paranoia, raise with tuning

CRS paranoia levels run 1 to 4: higher catches more but false-positives more.
Start at PL1 (the default); PL3/PL4 are for high-security contexts after real
exclusion work, never a default. The CRS scores anomalies across many rules and
blocks when the request crosses a threshold, so tuning is about the score, not
one rule.

## Tune the CRS to the actual stack

The default CRS is SQL- and PHP-centric. Matching it to the stack is where most
of the value is.

- Node.js + MongoDB: the real threat is NoSQL injection, and the SQLi rules do
  not catch it. `{"username":{"$gt":""},"password":{"$gt":""}}` matches every
  user; `{"$where":"sleep(5000)"}` is a DoS. Add rules blocking MongoDB
  operators (`$gt`, `$ne`, `$where`) in request parameters and JSON bodies,
  prototype-pollution patterns (`__proto__`, `constructor.prototype`), and
  server-side JS injection. Drop the PHP, Java, and IIS rule files. Keep SQLi
  rules only if any SQL database exists anywhere in the architecture.
- Apache + SQL or PHP: the inverse, the SQLi and PHP rule files are the core.

## Tune, don't disable

When a legitimate request trips a rule, write a targeted exclusion (that rule
off for that URI, parameter, or internal IP), never a blanket whitelist of the
whole path, which turns the WAF off where it is needed most.

```
# remove a specific rule for a specific endpoint, keep it everywhere else
SecRule REQUEST_URI "@beginsWith /api/orders" \
  "id:999100,phase:1,pass,nolog,ctl:ruleRemoveById=942100"
```

JSON APIs are the usual false-positive source (structured payloads look like
attacks), so scope exclusions to the API paths rather than relaxing rules
globally.

## Performance and operations

Skip static assets and health-check endpoints from inspection, cap the request
and response body sizes that get scanned, but keep response-body inspection on
for data-leakage rules. Update the CRS regularly. Test every rule change two
ways: fire known attack payloads to confirm detection AND replay real traffic
to confirm it still passes. Ship the audit log to the SIEM.
