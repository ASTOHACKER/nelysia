# Hello Example (Quickstart)

Consumer-style entrypoint — copy these files into your own project, they only
import the published package (no monorepo paths).

| File | Purpose | Run |
| --- | --- | --- |
| `app.ts` | App definition (routes). **Canonical: edit this one.** | — |
| `index.ts` | Node entrypoint (`app.listen(3000)`). **Canonical: run this one.** | `node --experimental-strip-types examples/hello/index.ts` or `npm run example` (Node 22+) |
| `bun.ts` | Bun entrypoint via `createBunHandler`. | `bun run examples/hello/bun.ts` or `npm run bun:example` (Bun 1.4+) |
| `bun-smoke.ts` | Zero-port Bun smoke (used by CI). | `npm run bun:smoke` |

Prerequisite inside this monorepo: `npm run package:build` first (examples
resolve `@narudom96/nelysia` through the built `dist-package/`).

Try it:

```bash
npm run example
curl http://localhost:3000/
curl http://localhost:3000/users/42
```
