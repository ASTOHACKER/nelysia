# Nelysia — Historical Roadmap สู่ v1.0

เอกสารนี้เป็น historical record ของงานหลัง `v0.5.1` จนถึง API freeze ที่ `v1.0`
และการ release `v1.0.0`; source of truth สำหรับสถานะปัจจุบันอยู่ที่
[`docs/release-status.md`](./release-status.md) และ
[`docs/reference/versioning.md`](./reference/versioning.md).
การเปลี่ยนแปลงก่อน v1 เป็น additive เท่านั้น และ tag เดิมเป็น immutable

## สถานะ ณ release v1.0.0

- package ใน milestone นี้: `1.0.0`
- `v0.6.0`, `v0.5.1` และ `v1.0.0` เป็น tag ที่ immutable
- execution lanes ที่สื่อสารกับผู้ใช้มีเพียง `COMPILED`, `SPECIALIZED`, `GENERIC`
- `static-prebuilt`, `static-sync`, generated validator และ params fast path เป็น
  internal diagnostics/subtiers ไม่ใช่ public tier เพิ่มเติม
- 24-hour soak ยัง deferred ใน milestone นี้ และไม่ใช่ claim ของ release

## v0.6 — Strict Types, Context และ Lifecycle

- ใช้ generic default `{}` และไม่ใช้ broad index signature ใน `Context` หรือ
  `RouteOptions`; macro keys ต้องมาจาก macro ที่ register จริง
- เพิ่ม `AuthStrategyRegistry` แบบ module augmentation โดยคง `jwt`, boolean และ
  legacy string เป็น compatibility/deprecated escape hatches
- แยก `stateValues` และ `decorationValues`; `context.store` เป็น canonical state
  contract และยัง mirror alias เดิมใน v0.x
- คง `derive()`/`resolve()` สำหรับ sync/async และ `.lazy()`/`.mountLazy()` โดยยัง
  รองรับ `.use(Promise)`
- ตรวจ lifecycle scope ให้ `local`, `scoped`, `global`, group และ mount ไม่รั่วไป
  sibling route
- explicit `.options()` ต้องทำงานก่อน automatic `204 + Allow`
- sync README, documentation map, release status และ full docs โดยคง historical
  references แยกจาก current status

## v0.7 — Unified Metadata, Auth และ Typed DX

route และ group ใช้ metadata ชุดเดียวกัน:

```ts
app.post("/orders/:id", ({ auth, body }) => ({ id: auth.sub, body }), {
  auth: { strategy: "jwt", role: "user", permissions: ["orders:write"] },
  body: OrderInput,
  response: { 201: Order, 400: BadRequest, 401: Unauthorized },
  rateLimit: "20/min",
  timeout: 5000,
  cache: true
})
```

inheritance คือ application → parent group → child group → route; ค่าที่ใกล้กว่า
ชนะ, object merge แบบ shallow, array/permissions ที่ประกาศใหม่แทนค่าเดิม และ
`false` ใช้ปิดค่า inherited ได้ ไม่มี implicit feature activation

ระดับ application สามารถตั้งค่าเริ่มต้นด้วย `new Nelysia({ routeOptions })` ได้
โดย route และ group ที่อยู่ลึกกว่าจะ override หรือ merge ตามกติกาเดียวกัน
metadata ที่ normalize แล้วจะถูกเก็บไว้ใน route manifest เพื่อให้ CLI/compiler
แสดงผลได้ตรงกับ behavior จริง

### Provider architecture

- `AuthStrategyProvider` และ route feature providers ของ rate limit, cache, timeout
  ต้อง register ผ่าน plugin/registry
- route ที่ประกาศ provider ซึ่งยังไม่ register ต้อง fail ตอน registration โดยบอก
  method, path และ feature
- route ที่ไม่ใช้ feature ต้องไม่สร้าง guard, timer, parser หรือ allocation เพิ่ม
- core ไม่ผูก dependency โดยตรงกับ Better Auth หรือ session store

### Authentication semantics

- `auth: "jwt"`/`auth: "session"` คือ required; `auth: "optional"` ต้องมี
  provider เดียวที่ active
- credential ที่ส่งมาแต่ไม่ถูกต้องต้องเป็น `401`; role/permission ไม่ผ่านเป็น `403`
- role ผ่านอย่างน้อยหนึ่งค่า, permissions ต้องผ่านทุกค่า และ authentication กับ
  authorization ใช้ AND semantics
- `jwt<Claims>()`, `JwtPluginInstance<Claims>`, lazy `ctx.jwt` และ typed `ctx.auth`
  ต้อง narrow ได้ตาม route; public route ไม่อ่านหรือ verify Authorization
- คง strict HS256, signature, `exp`, `nbf`, issuer และ audience

### Typed API

- route-aware `inject()` เพิ่ม `injectTyped()` และ `injectUntyped()` โดยคง API เดิม
- `createClient<typeof app>()` อยู่ร่วมกับ `createTypedClient<RouteMap>()`
- infer path params, body, query, headers, status-specific response และ typed errors
- คง response schema เดี่ยว, `responses` map, positional response และเพิ่ม body-first
  `response(body, { status, headers })` รวมถึง `error(status, body)`
- `ServerInfo` เพิ่ม `NelysiaServer` และ `stop()` โดยไม่เปลี่ยน behavior runtime เดิม

## v0.8 — Compiler Coverage และ Performance

- สร้าง deterministic schema IR สำหรับ built-in subset: primitive, object,
  required, array, tuple, enum, const, anyOf, allOf, min/max, length, pattern และ
  date-time ที่พิสูจน์ semantics ได้
- Standard Schema, transform, custom behavior, native `Response`, stream และ
  custom serializer fallback ไป generic อัตโนมัติ
- generated validator/serializer ต้อง parity กับ generic path และ manifest ต้อง
  บอก route, field และเหตุผลของ fallback
- compiler อ่าน metadata เพื่อข้าม auth/query/session/body/cache/timeout ที่ไม่ได้ใช้
- static และ params route ที่พิสูจน์ได้ใช้ compiled/specialized lane; unknown behavior
  fallback generic ทันที
- ปรับ Node single trailing-param route ด้วย direct URL extraction และวัด before/after
  ด้วย fixture และ runner ชุดเดียวกันเท่านั้น
- ห้ามอ้าง speedup จาก benchmark คนละ harness หรือคนละ workload

## v0.9 — Production Modules, Tooling และ Evidence

- harden `upload`, `logger`, `timeout`, `session`, `roles`, `csrf`, `cache/ETag` และ
  `health/readiness` ให้มี typed contract, cleanup/failure behavior, security defaults,
  redaction และไม่มี overhead เมื่อไม่ได้เปิดใช้
- CLI ต้องมี `inspect`, `routes`, `doctor`, `create`, `dev`, `build`, `generate`,
  `client` และมี test ครบทุกคำสั่ง
- deployment smoke ของ Node, Bun, Deno, Cloudflare และ Vercel
- ตรวจ tarball และ imports ของทั้ง 25 exports บน Node/Bun/Deno
- มี executable examples สำหรับ basic, JWT, upload และ typed client
- sync README, full docs, migration, limitations, operational checklist และ release notes

## v1.0 — API Freeze

freeze contract ของ Routing, Context, Route Options, Schema, Auth, Plugins,
Lifecycle, Errors, Server, Inject และ Client

รายการตรวจ freeze อยู่ที่ [`api-freeze-checklist.md`](./api-freeze-checklist.md)
และ public contract ถูก freeze แล้วหลัง v0.7–v0.9 gates ผ่านครบ ก่อนปล่อยเป็น
package `v1.0.0`

- `1.0.x` แก้เฉพาะ bug/security; ความสามารถใหม่ต้อง additive
- breaking change ไป `2.0`
- legacy API ต้องมี deprecation notice ก่อนลบ
- production-ready หมายถึง technical evidence ครบ ไม่ใช่จำนวนผู้ใช้ที่ตรวจสอบไม่ได้

## Release gates

- `npm run typecheck`, `npm test`, `bun test` และ negative type tests ด้วย
  `@ts-expect-error`
- JWT security/correctness, state/decorate/derive/resolve, lifecycle scope,
  typed inject/client, response/error, compiler parity/fallback, upload/logger/timeout
- `npm run package:build`, `npm run package:imports`, `npm run framework:check`,
  `npm run docs:check`, deployment smoke, security audit และ `git diff --check`
- short benchmark: warmup 2–3 วินาที, 5–10 วินาที × 3–5 รอบ, route counts 1/10/100/500,
  median/min/max, p95/p99, failures, CPU, RSS, heap และ environment ครบ
- regression ไม่เกิน 2% ผ่าน; 2–5% ต้อง investigate; มากกว่า 5% หรือ unexplained
  regression block release
- fuzz 1,000–10,000 cases, memory burst 10k/50k/100k requests และตรวจทั้ง
  `app.inject()` กับ `listen(0) → fetch()`

Milestone commands:

- `npm run release:check:v07` — typed metadata/auth/client/inject contracts
- `npm run release:check:v08` — compiler, short performance, runtime and fuzz gates
- `npm run release:check:v09` — package, module, deployment and framework gates
- `npm run release:check:v1` — final gate plus `npm run api:freeze:check`; it
  validates the frozen contract before the `v1.0.0` release tag

24-hour soak ไม่บังคับใน v1.0 รอบนี้; 30m, 1h, 6h และ 24h เป็น future evidence gate
ของ milestone นี้ และยังห้ามประกาศ production readiness ก่อน evidence ที่
เกี่ยวข้องครบ

## Compatibility policy

v0.x ใช้ deprecation ก่อน breaking change, ไม่มี automatic query/body coercion ใหม่,
provider ที่ขาดต้อง fail ตอน registration และ compiler ที่พิสูจน์ไม่ได้ต้อง fallback
generic เสมอ

งานต่อจาก roadmap นี้อยู่ใน [Next Workspace Win Matrix Completion](./release-status.md#next-workspace-win-matrix-completion-unreleased)
และยังไม่เป็น release claim จนกว่าจะผ่านทุก gate ที่ระบุไว้
