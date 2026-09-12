# Nelysia

Compiler-first TypeScript backend framework for Bun and Node.js.

## Install

```bash
npm install @narudom96/nelysia
# optional integrations — install only what you use
npm install graphql          # for @narudom96/nelysia/graphql
npm install drizzle-orm      # for @narudom96/nelysia/drizzle
npm install @prisma/client   # for @narudom96/nelysia/prisma
npm install better-auth      # for @narudom96/nelysia/better-auth
npm install ai               # for AI SDK routes
```

### Install from GitHub Releases (no registry needed)

Every release at <https://github.com/ASTOHACKER/nelysia/releases> ships a ready-to-install
tarball (`narudom96-nelysia-<version>.tgz`, prebuilt `dist-package` inside, 91 files).
Use this while the package is not yet (or whenever it is not) on the npm registry:

```bash
# 1. Download the tarball from the release page
curl -o nelysia.tgz https://github.com/ASTOHACKER/nelysia/releases/download/v0.1.0/narudom96-nelysia-0.1.0.tgz

# 2. Install from the local file (works even on locked-down npm setups)
npm install ./nelysia.tgz
```

On a standard npm setup the two steps collapse into one:

```bash
npm install https://github.com/ASTOHACKER/nelysia/releases/download/v0.1.0/narudom96-nelysia-0.1.0.tgz
```

Replace `v0.1.0` / the filename with the latest release you see on the releases page.

```ts
// app.ts
import { Nelysia } from "@narudom96/nelysia"

export const app = new Nelysia()
  .get("/", () => "Hello from Nelysia!")
  .get("/users/:id", ({ params }) => ({ id: params.id }))

app.listen(3000)
```

```bash
node app.js          # Node 22+
bun run app.ts       # Bun 1.4+
```

Works on Node.js 22+, Bun 1.4+, Deno, Cloudflare Workers, and Vercel. See `@narudom96/nelysia/runtime-fetch`, `@narudom96/nelysia/runtime-vercel`, and `@narudom96/nelysia/runtime-cloudflare`.

📚 **Full Documentation / คู่มือการใช้งานอย่างละเอียด:**
- 🏛️ [System Architecture Blueprint (โครงสร้างสถาปัตยกรรม)](./docs/ARCHITECTURE.md)
- 🇬🇧 [Comprehensive Documentation (English)](./docs/DOCUMENTATION_EN.md)
- 🇹🇭 [คู่มือการใช้งานอย่างละเอียด (ภาษาไทย)](./docs/DOCUMENTATION_TH.md)

This repository currently contains the first vertical slice:

- deterministic route matching with params
- request-local context
- reference execution path
- Node HTTP adapter
- compiler metadata and conservative specialization decisions
- differential tests for reference and compiled execution

The feature parity roadmap is tracked in [`docs/elysia-parity.md`](./docs/elysia-parity.md).

The first release has a finite scope. Its completion criteria and deferred work are tracked in [`docs/v0.1-definition-of-done.md`](./docs/v0.1-definition-of-done.md).

Future P2 milestones are tracked in [`docs/p2-roadmap.md`](./docs/p2-roadmap.md).

Live implementation status is tracked in [`docs/release-status.md`](./docs/release-status.md).

Runtime support and verification commands are tracked in [`docs/compatibility.md`](./docs/compatibility.md).

Platform examples are documented in [`docs/platform-examples.md`](./docs/platform-examples.md).

The credential-free AI SDK route example is documented in [`docs/ai-sdk.md`](./docs/ai-sdk.md).

Migration notes are documented in [`docs/migration.md`](./docs/migration.md).

Open the complete static documentation at [`docs/index.html`](./docs/index.html), or serve it locally with `python3 -m http.server 8080 --directory docs`.

Latest verified test and benchmark results: [`docs/benchmark-results.html`](./docs/benchmark-results.html).

Ten-round benchmark report: [`docs/benchmark-10-rounds.md`](./docs/benchmark-10-rounds.md).

## Run

```bash
npm test
npm run typecheck
npm run example
```

Node 22+ is required for the Node test and example commands. Bun 1.4+ is supported by the Bun adapter in this MVP.

With Bun installed, run the Bun target:

```bash
bun test
npm run bun:smoke
npm run bun:example
```

## Try a real HTTP request

Start the example server in one terminal:

```bash
npm run example
```

Call it from another terminal:

```bash
curl http://localhost:3000/
curl http://localhost:3000/users/42
```

Expected responses:

```text
Hello Nelysia
{"id":"42"}
```

Validate JSON input:

```ts
import { Nelysia, t } from "@narudom96/nelysia"

const app = new Nelysia().post("/users", ({ body }) => body, {
  body: t.Object({
    name: t.String(),
    age: t.Number()
  })
})
```

Invalid input returns `400`; a request body larger than the configured `bodyLimit` returns `413`.

Inspect the route analysis:

```bash
npm run inspect -- ./examples/hello/app.ts
```

Build a runnable target entrypoint:

```bash
npm run build -- ./examples/hello/app.ts --target bun
bun dist/server.bun.ts
```

The build also writes `dist/manifest.json`, which records the target, route analyses, generation mode, and explicit diagnostics. Supported static and params-only GET routes produce a standalone artifact; other applications retain the application entry and selected runtime adapter. `sourceToSource: false` documents that arbitrary source-to-source route generation remains deferred. See [`spec/build-manifest.md`](./spec/build-manifest.md).
