const fs = require('node:fs')

const rows = JSON.parse(fs.readFileSync('customers.json', 'utf8'))
  .filter(r => r.plan === 'enterprise')
  .sort((a, b) => b.mrr - a.mrr)

console.log(['name', 'plan', 'mrr'].join('\t'))
for (const r of rows) console.log([r.name, r.plan, r.mrr].join('\t'))
