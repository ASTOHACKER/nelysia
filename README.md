<p align="center">
  <img src="docs/logo.svg" width="80" height="80" alt="Nelysia Logo" />
</p>

<h1 align="center">Nelysia</h1>

<p align="center">
  <b>Compiler-first TypeScript backend framework for Bun, Node.js, and Web Standards.</b>
</p>

## Install

> ⚠️ **Right now `npm install @narudom96/nelysia` does NOT work yet** (npm account
> suspension until Sep 16 — then the registry install below takes over).
> **Until then, do THIS instead** (2 commands, same result):

```bash
curl -o nelysia.tgz https://github.com/ASTOHACKER/nelysia/releases/download/v0.1.4/narudom96-nelysia-0.1.4.tgz
npm install ./nelysia.tgz
```

After that, everything is identical — `import { Nelysia } from "@narudom96/nelysia"`
works exactly as if installed from the registry:

```bash
# registry install (works once v0.1.4 is published — replaces the 2 lines above)
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
tarball (`narudom96-nelysia-<version>.tgz`, prebuilt `dist-package` inside, 99 files).
Use this while the package is not yet (or whenever it is not) on the npm registry:

```bash
# 1. Download the tarball from the release page
curl -o nelysia.tgz https://github.com/ASTOHACKER/nelysia/releases/download/v0.1.4/narudom96-nelysia-0.1.4.tgz

# 2. Install from the local file (works even on locked-down npm setups)
npm install ./nelysia.tgz
```

On a standard npm setup the two steps collapse into one:

```bash
npm install https://github.com/ASTOHACKER/nelysia/releases/download/v0.1.4/narudom96-nelysia-0.1.4.tgz
```

Replace `v0.1.4` / the filename with the latest release you see on the releases page.

```ts
// app.ts
import { Nelysia } from "@narudom96/nelysia"
import { cors } from "@narudom96/nelysia/plugins"

export const app = new Nelysia()
  .use(cors())
  .get("/", ({ html }) => html("<h1>Hello from Nelysia v0.1.4!</h1>"))
  .get("/users/:id", ({ params, query }) => ({
    id: params.id,
    filter: query.filter ?? "all"
  }))
  .group("/api/v1", (api) => {
    api.get("/status", () => ({ status: "operational", uptime: process.uptime() }))
  })

app.listen(3000, ({ port, url }) => {
  console.log(`🚀 Nelysia server running at ${url} on port ${port}`)
})
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
- 🌐 [Interactive Documentation Portal (เว็บคู่มือใช้งาน)](./docs/index.html)

### What's New in v0.1.4
- 🚀 **Unified `app.listen(port, callback)`**: Automatically passes `{ port, hostname, url, server }` to your callback on both Bun and Node.js.
- ⚡ **Response Shorthands**: `context.html()`, `context.text()`, `context.json()`, and `context.redirect()`.
- 🔍 **`context.query` Proxy**: Destructure query parameters directly: `({ query }) => query.search`.
- 🛠️ **`context.set` & `context.store`**: Status/header mutation (`set.status = 201`) and request-scoped state sharing.
- 🛡️ **Built-in Plugins**: `cors()`, `securityHeaders()`, and `staticDirectory()`.
- 📂 **Route Grouping**: `app.group(prefix, callback)` with nested hook inheritance.
- 🚫 **Custom 404 Handler**: `app.notFound(({ path }) => ...)` for tailored fallback responses.
- 📖 **OpenAPI & Swagger UI**: `swaggerUi()` interactive documentation and route metadata (`summary`, `description`, `tags`).

---

## ⚡ 10 Superpowers & Killer Capabilities (10 สรรพคุณระดับเทพ)

| # | Superpower / จุดเด่น | Description / รายละเอียด |
| :---: | :--- | :--- |
| **1** | 🧬 **AOT 3-Tier Compiler Specialization** | Analyzes the full route graph at build/startup time. Separates endpoints into `COMPILED` (raw static buffers), `SPECIALIZED` (zero-overhead direct parameter extraction), and `GENERIC` (full middleware pipeline). |
| **2** | 🏎️ **30,600+ Req/s & Zero GC Overhead** | Verified benchmark throughput of **30,618 req/s** (0.33 ms latency) on Bun with **0% memory garbage collection pressure** on static paths — outperforming Elysia by **+7.0%** and even beating Raw Bun! |
| **3** | 🎯 **V8 Monomorphic Shape Stability** | Engineered with strict mechanical sympathy. Avoids dynamic context property decoration (`.decorate()`) that mutates object layouts and breaks V8 Inline Caches (IC). `context.store` guarantees peak JIT optimization. |
| **4** | 🌐 **True First-Class Dual-Runtime** | Built with native zero-dependency adapters for both **Node.js 22+** (`node:http` with `--experimental-strip-types`) and **Bun 1.4+** (`Bun.serve`). Zero polyfill overhead, zero build step required. |
| **5** | 🚀 **Multi-Core Clustered Mode Built-in** | Scale seamlessly across all CPU cores on Node.js using `serveClustered(app, { instances: 'max' })` with built-in rolling restarts and graceful shutdown drains — no PM2 required. |
| **6** | 🛡️ **Universal Standard Schema v1** | Comes with a featherweight built-in `t` schema builder, and supports **Zod**, **Valibot**, and **ArkType** natively via the official Standard Schema v1 specification without performance-killing adapter layers. |
| **7** | 📖 **Living OpenAPI 3.1 & Interactive UIs** | Automatically extracts schemas and routes into a live OpenAPI 3.1 specification. Bundles interactive **Redoc** and **Swagger UI** out of the box at `/docs` with route tags, summaries, and descriptions. |
| **8** | 🔌 **End-to-End Type-Safe Client SDK** | Full client generation via `@narudom96/nelysia/client` with Eden-style autocompletion for endpoints, query params, headers, request bodies, and typed return values. |
| **9** | 🧰 **Batteries-Included Production Armor** | Production-ready security and performance suite: automatic preflight `cors()`, OWASP-grade `securityHeaders()`, sliding-window `rateLimit()`, path-traversal-guarded `staticDirectory()`, and high-ratio `compression()`. |
| **10** | 🤖 **AI SDK & Cloud Native Integrations** | Native adapters and official recipes for **Vercel AI SDK** (streaming LLM responses), **Drizzle ORM**, **Prisma**, **Better Auth**, **GraphQL**, **WebSockets**, Server-Sent Events (SSE), and Edge runtimes. |

---


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
One-hundred-round benchmark report: [`docs/benchmark-100-rounds.md`](./docs/benchmark-100-rounds.md).

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
