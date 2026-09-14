<p align="center">
  <img src="docs/logo.png" width="110" height="110" alt="Nelysia Logo" />
</p>

<h1 align="center">Nelysia</h1>

<p align="center">
  <b>Compiler-first TypeScript backend framework for Bun, Node.js, and Web Standards.</b>
</p>

## Install

> **Current development note:** the workspace is implementing `@narudom96/nelysia@0.5.1`.
> The latest immutable GitHub artifact remains v0.4.0 until the v0.5.0 release gates
> are complete; npm publication is still pending registry availability.

```bash
curl -o nelysia.tgz https://github.com/ASTOHACKER/nelysia/releases/download/v0.4.0/narudom96-nelysia-0.4.0.tgz
npm install ./nelysia.tgz
```

After that, everything is identical — `import { Nelysia } from "@narudom96/nelysia"`
works exactly as if installed from the registry:

```bash
# registry install (works once a v0.5.1 package is published)
npm install @narudom96/nelysia
# optional integrations — install only what you use
npm install graphql          # for @narudom96/nelysia/graphql
npm install drizzle-orm      # for @narudom96/nelysia/drizzle
npm install @prisma/client   # for @narudom96/nelysia/prisma
npm install better-auth      # for @narudom96/nelysia/better-auth
```

### Install from GitHub Releases (no registry needed)

Every release at <https://github.com/ASTOHACKER/nelysia/releases> ships a ready-to-install
tarball (`narudom96-nelysia-<version>.tgz`, with the prebuilt `dist-package` inside).
Use this while the package is not yet (or whenever it is not) on the npm registry:

```bash
# 1. Download the tarball from the release page
curl -o nelysia.tgz https://github.com/ASTOHACKER/nelysia/releases/download/v0.4.0/narudom96-nelysia-0.4.0.tgz

# 2. Install from the local file (works even on locked-down npm setups)
npm install ./nelysia.tgz
```

On a standard npm setup the two steps collapse into one:

```bash
npm install https://github.com/ASTOHACKER/nelysia/releases/download/v0.4.0/narudom96-nelysia-0.4.0.tgz
```

Replace `v0.4.0` / the filename with the latest release you see on the releases page.

```ts
// app.ts
import { Nelysia } from "@narudom96/nelysia"
import { cors } from "@narudom96/nelysia/plugins"

export const app = new Nelysia()
  .use(cors())
  .get("/", ({ html }) => html("<h1>Hello from Nelysia v0.5.1!</h1>"))
  .get("/users/:id", ({ params, query }) => ({
    id: params.id,
    filter: query.filter ?? "all"
  }))
  .group("/api/v1", (api) => {
    api.get("/status", () => ({ status: "operational", uptime: process.uptime() }))
  })

app.listen(3000, ({ port, url }) => {
  console.log(`Nelysia server running at ${url} on port ${port}`)
})
```

```bash
node app.js          # Node 22+
bun run app.ts       # Bun 1.4+
```

Works on Node.js 22+, Bun 1.4+, Deno, Cloudflare Workers, and Vercel. See `@narudom96/nelysia/runtime-fetch`, `@narudom96/nelysia/runtime-vercel`, and `@narudom96/nelysia/runtime-cloudflare`.

**Full Documentation / คู่มือการใช้งานอย่างละเอียด:**
- [System Architecture Blueprint (โครงสร้างสถาปัตยกรรม)](./docs/ARCHITECTURE.md)
- [Feature Modules and Composition](./docs/feature-modules.md)
- [Comprehensive Documentation (English)](./docs/DOCUMENTATION_EN.md)
- [คู่มือการใช้งานอย่างละเอียด (ภาษาไทย)](./docs/DOCUMENTATION_TH.md)
- [Interactive Documentation Portal (เว็บคู่มือใช้งาน)](./docs/index.html)

### What's New in v0.5.1 (implementation branch)
- **Bun zero-argument route fast path**: static function routes now use `static-sync` in single- and multi-route dispatchers; `.getStatic()` remains the separate `static-prebuilt` tier.
- **Native result parity**: `Response`, `ReadableStream`, response metadata, and handler errors are handled once without re-running the handler.
- **Route benchmark taxonomy**: the release runner separates prebuilt, zero-argument specialized, and params-only workloads with matched single/multi-route fixtures.
- **Strict JWT route guards**: internal metadata registry, HS256-only verification, optional issuer/audience checks, and no auth work on public routes.
- **Generated schema fast path**: deterministic built-in params/query/header/response schemas use generated validators; Standard Schema and custom behavior fall back to generic execution with diagnostics.
- **Production plugins**: `@narudom96/nelysia/upload`, `@narudom96/nelysia/logger`, and `@narudom96/nelysia/timeout` provide multipart storage, redacted typed logging, and deadline cancellation contracts.
- **Release evidence runners**: `benchmark:oha:release`, `soak:1m`, `soak:10m`, and `soak:24h` record reproducible environment, latency, failures, and memory samples.

### v0.4.0 highlights
- **Official `@narudom96/nelysia/jwt`**: Native Web Crypto HMAC-SHA256 JWT auth with zero external dependencies and zero-overhead routing for unauthenticated routes.
- **Zero-Port Testing API (`app.inject`)**: Fast in-memory HTTP request injection for unit and integration testing without binding network sockets.
- **TechEmpower Round 22 Benchmark Suite**: Verified 100% compliant with TechEmpower specifications — **99k+ req/s** on JSON and **100k+ req/s** on Plaintext.
- **Latest `oha` snapshot**: A 10-round Bun static JSON run measured **95,173 req/s** at concurrency 50 with zero failures; Raw Bun measured **95,306 req/s**. The report records prior run sets and variance.
- **Runnable ecosystem fixtures**: Astro, Next.js, Nuxt/Nitro, SvelteKit, and TanStack Start now have native route wiring, framework manifests, production builds, and live HTTP smoke coverage.
- **Standard Path and Node.js Engine Optimization**: Lazy context getters, zero-copy Node headers, and lazy 405 checks pushing Node.js throughput to **~34,800 req/s**.
- **Response Shorthands**: `context.html()`, `context.text()`, `context.json()`, and `context.redirect()`.
- **`context.query` Proxy**: Destructure query parameters directly: `({ query }) => query.search`.
- **`context.set` and `context.store`**: Status/header mutation and request-scoped state sharing.
- **Built-in Plugins**: `cors()`, `securityHeaders()`, and `staticDirectory()`.
- **Route Grouping**: `app.group(prefix, callback)` with nested hook inheritance.
- **Custom 404 Handler**: `app.notFound(({ path }) => ...)` for tailored fallback responses.
- **OpenAPI and Swagger UI**: `swaggerUi()` interactive documentation and route metadata.

---

## 10 Superpowers and Killer Capabilities (10 สรรพคุณระดับเทพ)

| # | Superpower / จุดเด่น | Description / รายละเอียด |
| :---: | :--- | :--- |
| **1** | **3-Lane AOT Compiler** | Static routes → raw buffer (zero overhead). Param routes → direct URL extraction. Complex routes → full pipeline. |
| **2** | **95,173 req/s — Raw Bun parity** | Ten-round local `oha` snapshot: Nelysia **95,173** vs Raw Bun **95,306 req/s**, zero failures; compare run sets in the report. |
| **3** | **V8 Stays in Fast Lane** | Stable context shape keeps the inline cache monomorphic. |
| **4** | **Node.js and Bun, No Polyfills** | Native `node:http` and `Bun.serve` runtimes. |
| **5** | **Multi-Core — No PM2 Needed** | `serveClustered()` uses every available CPU core. |
| **6** | **Zod, Valibot, ArkType — Just Plug In** | Standard Schema v1 support without adapter overhead. |
| **7** | **API Docs at `/docs`, Auto-Generated** | OpenAPI 3.1, Redoc, and Swagger UI support. |
| **8** | **Frontend Autocomplete, Typo-Free** | Typed client routes, params, bodies, and responses. |
| **9** | **Security Suite Out of the Box** | CORS, security headers, rate limiting, safe static files, and compression. |
| **10** | **Cloud Runtime Support** | Drizzle, Prisma, Better Auth, Cloudflare, Vercel, and Deno Edge integrations. |

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

The v0.5.0 release gate and known limitations are documented in
[`docs/v0.5-release-gates.md`](./docs/v0.5-release-gates.md).

The v0.5.0 30s × 7 core benchmark evidence is recorded in
[`docs/benchmark-oha-v05-2026-09-14.md`](./docs/benchmark-oha-v05-2026-09-14.md).

The v0.5.1 Bun route fast-path evidence is recorded in
[`docs/benchmark-route-fast-path-v051-2026-09-14.md`](./docs/benchmark-route-fast-path-v051-2026-09-14.md).

Runtime support and verification commands are tracked in [`docs/compatibility.md`](./docs/compatibility.md).

Platform examples are documented in [`docs/platform-examples.md`](./docs/platform-examples.md).

Migration notes are documented in [`docs/migration.md`](./docs/migration.md).

Open the complete static documentation at [`docs/index.html`](./docs/index.html), or serve it locally with `python3 -m http.server 8080 --directory docs`.

Latest verified test and benchmark results: [`docs/benchmark-results.html`](./docs/benchmark-results.html).

Latest `oha` load-generator report: [`docs/benchmark-oha-2026-09-14.md`](./docs/benchmark-oha-2026-09-14.md).

Ten-round benchmark report: [`docs/benchmark-10-rounds.md`](./docs/benchmark-10-rounds.md).
One-hundred-round benchmark report: [`docs/benchmark-100-rounds.md`](./docs/benchmark-100-rounds.md).

## Run

```bash
npm test
npm run typecheck
npm run example
```

Node 22+ is required for the Node test and example commands. Bun 1.4+ is supported by the Bun adapter. The current v0.5.1 workspace also includes runnable full-stack framework fixtures.

With Bun installed, run the Bun target:

```bash
bun test
npm run bun:smoke
npm run bun:example
```

To verify the five full-stack fixtures after installing their local dependencies:

```bash
for fixture in astro nextjs nuxt sveltekit tanstack-start; do
  (cd "examples/$fixture" && npm install)
done
npm run framework:check
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

### JWT Authentication with Zero Overhead

```ts
import { Nelysia } from "@narudom96/nelysia"
import { jwt, signJwt } from "@narudom96/nelysia/jwt"

const secret = process.env.JWT_SECRET
if (!secret) throw new Error("JWT_SECRET is required")

const app = new Nelysia()
  .use(jwt({
    secret,
    expiresIn: 3600
  }))
  .post("/login", async () => {
    // Replace this with a real user lookup and password check.
    const token = await signJwt({
      sub: "user-123",
      role: "admin"
    }, secret, { expiresIn: 3600 })

    return { token }
  })
  .get("/public", () => ({ status: "open" }))
  .get("/profile", ({ auth }) => ({ user: auth }), {
    auth: "jwt"
  })

app.listen(3000)
```

Run it with `JWT_SECRET` set. Protected routes require
`Authorization: Bearer <token>`; routes without `auth: "jwt"` do not inspect the
authorization header.

### Zero-Port Testing (`app.inject`)

```ts
const res = await app.inject({
  method: "GET",
  path: "/users/42",
  query: { filter: "active" }
})

console.log(res.statusCode) // 200
console.log(await res.json()) // { id: "42", filter: "active" }
```

### Benchmarks

Run high-throughput benchmarks powered by `oha`:

```bash
# TechEmpower Round 22 Plaintext & JSON benchmark
npm run benchmark:teb

# Security benchmark: public/protected plus invalid-token matrix, 30s × 7
npm run benchmark:jwt:release

# JWT Authentication benchmark (Nelysia vs Elysia vs Hono)
npm run benchmark:jwt

# Full suite across Bun and Node.js
npm run benchmark:oha

# Release evidence: 30 seconds × 7 samples, with environment and percentiles
npm run benchmark:oha:release

# Bun route fast-path evidence: run both matched route-set fixtures
BENCH_ROUTE_SET=single npm run benchmark:oha:route:release
BENCH_ROUTE_SET=multi npm run benchmark:oha:route:release

# Staged soak gates (24h is intentionally a separate production-readiness run)
npm run soak:1m
npm run soak:10m
npm run soak:24h
```

Latest local `oha` snapshot (10 rounds, 3 seconds per sample, concurrency 50,
zero failures):

| Workload | Raw runtime | Nelysia | Peer baseline |
| :--- | ---: | ---: | ---: |
| Bun static JSON | 95,306 req/s | 95,173 req/s | Elysia 76,062 |
| Bun dynamic params | 82,904 req/s | 83,855 req/s | Elysia 82,816 |
| Node JSON | 47,572 req/s | 27,451 req/s | Fastify 38,879; Express 21,130 |
| Node dynamic params | 47,607 req/s | 40,919 req/s | Fastify 38,846; Express 20,527 |

Environment: AMD Ryzen 5 5600 (6 cores / 12 threads), Bun 1.4.0, Node.js
v26.8.1, and oha 1.16.0. These are local directional measurements; see the
[full benchmark report](./docs/benchmark-oha-2026-09-14.md) for methodology,
previous runs, and variance notes.

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

The build also writes `dist/manifest.json`, which records the target, route analyses, generation mode, and explicit diagnostics. Routes whose handlers and schema definitions can be embedded safely produce a standalone source-to-source artifact; opaque or platform-dependent applications retain the application entry and selected runtime adapter with a reason-coded fallback diagnostic. See [`spec/build-manifest.md`](./spec/build-manifest.md).
