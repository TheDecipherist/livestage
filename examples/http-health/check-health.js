const http = require('node:http')

// The target: swap this for a real service URL. The local server below
// exists only so this example runs anywhere (offline, CI, a sandboxed
// checkout) with no external network dependency; it is scaffolding for the
// example, not part of the pattern being demonstrated.
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
})

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port
  const url = `http://127.0.0.1:${port}/health`
  const startedAt = Date.now()
  try {
    const res = await fetch(url)
    const latencyMs = Date.now() - startedAt
    console.log(JSON.stringify({ status: res.status, ok: res.ok, latency_ms: latencyMs }))
  } catch (err) {
    console.log(JSON.stringify({ status: 0, ok: false, latency_ms: Date.now() - startedAt, error: String(err) }))
  } finally {
    server.close()
  }
})
