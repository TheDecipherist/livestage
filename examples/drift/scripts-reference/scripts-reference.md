# Scripts Reference

The old way: a README hand-types "run `npm run dev` to start the
server," and six months later someone renames the script to
`start:dev`. The README never finds out; every new contributor hits the
same dead command and asks in chat.

The new way: read `package.json`'s `scripts` block live. This example
needs no shell grant at all, `package.json` reads are filesystem-policy,
not shell.

## Result

| script | command                    |
|--------|----------------------------|
| dev    | vite                       |
| build  | vite build && tsc --noEmit |
| test   | vitest run                 |
| lint   | eslint .                   |

---

Rename, add, or remove a script in `sample-project/package.json` and
re-render; the table above changes with it. Nothing here can go stale
the way a hand-typed table can.
