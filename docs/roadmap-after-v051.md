# Nelysia Roadmap หลัง v0.5.1

> **Archived — historical record, not current.** Current package คือ `v1.2.1`; ดูสถานะปัจจุบันที่ [release-status.md](./release-status.md).

> แผนฉบับเต็มที่เป็น source of truth อยู่ที่ [Final Roadmap สู่ v1.0](./roadmap-v1.md)

เอกสารนี้เป็นแผนงานถัดจาก `v0.5.1` และไม่แก้ไขหรือย้าย tag เดิม โดยแบ่งงานเป็น
milestone แบบ additive จนถึง v1.0

## สถานะปัจจุบัน

โค้ดใน worktree นี้มี implementation slice ของ core DX, typed inject/client,
compiler diagnostics, CLI และ production modules แล้ว แต่ยังไม่ประกาศเป็น
release ใหม่จนกว่า release gates ของ milestone นั้นจะผ่านครบ

execution model ที่เปิดเผยใน diagnostics มี 3 ระดับ:

- `COMPILED` — route ที่สร้างผลลัพธ์ได้จากข้อมูลที่พิสูจน์ได้
- `SPECIALIZED` — route ที่ลดงานบางส่วนได้ เช่น params-only
- `GENERIC` — route ที่ต้องใช้ lifecycle/runtime เต็มรูปแบบ

ชื่อ `static-prebuilt`, `static-sync`, generated validator และ params fast path
เป็น diagnostic subtier ภายใน ไม่ใช่ public execution tier เพิ่มเติม

## v0.6 — Strict Types, Context และ Lifecycle

- เปลี่ยน default generic ของ `Nelysia` เป็น `{}` และลด `any` ใน public types
- ตรวจ typo ใน `Context` และ `RouteOptions` พร้อม typed macro keys
- เพิ่ม `AuthStrategyRegistry` และคง legacy auth แบบ deprecated
- แยก canonical `context.store` จาก decoration พร้อม mirror alias ใน v0.x
- คง `derive()`/`resolve()` และเพิ่ม `.lazy()`/`.mountLazy()` แบบ additive
- ทำ scope ของ lifecycle (`local`, `scoped`, `global`) ให้สอดคล้องกับ mount/group
- ให้ explicit `.options()` มาก่อน automatic `204 + Allow`

## v0.7 — JWT และ Typed Developer Experience

- เพิ่ม generic `jwt<Claims>()`, lazy `ctx.jwt` และ typed `ctx.auth`
- คง HS256 และ strict validation ของ token, expiry, issuer และ audience
- ให้ public route ข้ามงาน Authorization และ protected route guard หลัง match
- เพิ่ม route-aware `app.inject()`/`injectTyped()` และ `createClient<typeof app>()`
- เพิ่ม `NelysiaServer.stop()` ใน normalized server metadata
- เพิ่ม body-first response helpers และ `error(status, body)`

## v0.8 — Compiler และ Performance

- สร้าง deterministic schema IR และ generated validator/serializer แบบ subset
- fallback Standard Schema, transform, custom serializer, stream และ native
  `Response` ไป generic โดยมี route-scoped diagnostic reason
- คง `getStatic()` เป็น `static-prebuilt` และ zero-arg `.get()` เป็น `static-sync`
- ปรับ Node single trailing-param routeโดยวัด before/after ใน runner เดียวกัน
- ห้ามรวมผล benchmark คนละ fixture หรือคนละ harness เป็น speedup เดียว

## v0.9 — Modules, Tooling และ Operational Readiness

- harden subpaths `upload`, `logger`, `timeout`
- เพิ่ม subpaths `session`, `roles`, `csrf`, `cache`, `health`
- ทุก module ต้องมี typed contract, cleanup/failure behavior และ redaction/security
  behavior พร้อมไม่มี overhead เมื่อไม่ได้เปิดใช้
- CLI หลัก: `routes`, `doctor`, `create`, `dev`, `inspect`, `build`, `generate`,
  `client`
- ตรวจ deployment smoke ของ Node, Bun, Deno, Cloudflare และ Vercel
- ตรวจ tarball/imports และมี executable examples ของ basic, JWT, upload และ typed client
- sync README, migration guide, limitations, operational checklist และ release notes

ตัวอย่างที่รันได้อยู่ใน `examples/hello`, `examples/jwt`, `examples/upload` และ
`examples/typed-client` เพื่อให้แต่ละ public contract มีจุดเริ่มต้นที่ตรวจสอบได้

## Release gates

ทุก milestone ต้องผ่าน typecheck, Node/Bun tests, type-level tests,
compiler parity/fallback tests, package build/imports, deployment/framework smoke,
`docs:check`, security audit และ `git diff --check`

Hot-path change ต้องมี before/after ใน runner เดียวกัน โดย release benchmark ใช้
warmup แยก, 30 วินาที × 7 samples, concurrency 50 และรายงาน median/min/max,
p95/p99, failures, CPU, RSS, heap และ environment

soak gate ของ roadmap ปัจจุบันเริ่มจาก 1M และ 10M requests. หลักฐาน 30m, 1h,
6h และ 24h เป็น future production evidence แบบเลือกใช้ ไม่ใช่ gate ที่บังคับใน
v1.0 รอบนี้. **24-hour soak ยังไม่ทำในรอบนี้ตามที่ผู้ใช้อนุมัติ** และยังไม่ประกาศ
production readiness จากการมี implementation เพียงอย่างเดียว

## Compatibility policy

v0.x จะใช้ deprecation ก่อน breaking change, ไม่มี automatic query/body coercion
ใหม่ และ behavior ที่ compiler พิสูจน์ไม่ได้ต้อง fallback generic เสมอ
