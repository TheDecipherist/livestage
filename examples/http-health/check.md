# HTTP Health-check Example (Reach Via Code)

There is no `@http` directive. `fetch` lives entirely inside the `@code`
script; the document only ever receives structured status out.

The target here is a local server the script starts and tears down itself,
so this example runs anywhere with no external network dependency. Point
`fetch` at a real service URL and nothing else in this document changes.

## Policy grant this example needs

`.livestage/policy.json` in this directory:

```json
{
  "code": {
    "languages": ["javascript"],
    "timeout": 10000,
    "runners": {}
  }
}
```

That is the whole grant: `code.languages` includes `javascript`, nothing else.

## Result


- Status: 200
- OK: true
- Latency: 38ms
