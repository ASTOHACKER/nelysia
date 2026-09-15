# Nelysia Documentation Map

> Current package line: `v1.0.0` · Node.js 22+ · Bun 1.4+

หน้านี้เป็นจุดเริ่มต้นของเอกสารทั้งหมด เอกสารแบ่งตามคำถามที่ต้องการตอบ
เพื่อไม่ให้คู่มือใช้งานปะปนกับ roadmap หรือ benchmark evidence

## เริ่มต้นใช้งาน

1. [Interactive Documentation Portal](./index.html) — คู่มือแบบเว็บ ภาษาไทย/อังกฤษ
2. [คู่มือภาษาไทย](./DOCUMENTATION_TH.md) — API และตัวอย่างแบบละเอียด
3. [English Documentation](./DOCUMENTATION_EN.md) — complete technical reference
4. [Migration Guide](./migration.md) — ความต่างจาก Express, Fastify และ Elysia

ในหน้าเว็บ ให้เริ่มจาก [Quick Start](./index.html#quickstart) แล้วไปต่อที่
[Testing](./index.html#testing), [Typed Client](./index.html#client),
[Production Modules](./index.html#production-modules) หรือ [Package Exports](./index.html#exports)
ตามสิ่งที่กำลังสร้าง

ตัวอย่างที่รันได้:

- [Basic](../examples/hello/index.ts) — route พื้นฐานและ Node server
- [JWT](../examples/jwt/index.ts) — HS256 และ protected route
- [Upload](../examples/upload/index.ts) — multipart และ storage
- [Typed client](../examples/typed-client/client.ts) — `createClient<typeof app>()`

ดูคำสั่งรันทั้งหมดใน [Executable Examples](./index.html#examples)

## API และสถาปัตยกรรม

- [Architecture Blueprint](./ARCHITECTURE.md) — execution lanes, compiler และ runtime boundary
- [Feature Modules](./feature-modules.md) — การแบ่ง module/service/model/plugin/test
- [Platform Examples](./platform-examples.md) — Next.js, Nuxt, SvelteKit, Astro, TanStack Start
- [Elysia Parity](./elysia-parity.md) — parity ที่ตั้งใจรองรับและสิ่งที่ไม่ copy

## สถานะและแผนงาน

- [Release Status](./release-status.md) — checklist และ gate ที่ผ่าน/ยังค้าง
- [Final Roadmap สู่ v1.0](./roadmap-v1.md) — milestone v0.6–v0.9 และ API freeze
- [API Freeze Checklist](./api-freeze-checklist.md) — contract ที่ต้องตรวจและ freeze ก่อน v1.0
- [v1.0 Guide](./v1.0.md) — public contract, ตัวอย่าง, workflow, gates และสถานะ release ในไฟล์เดียว
- [Roadmap หลัง v0.5.1](./roadmap-after-v051.md) — implementation history/summary
- [Development Plan](./development-plan.md) — ขอบเขตงานและ compatibility policy
- [P2 Roadmap](./p2-roadmap.md) — แผน compiler/optimization ที่เก็บไว้ต่อ

หมายเหตุ: `v0.5.1` และ `v0.6.0` เป็น historical immutable releases; `v1.0.0`
เป็น release ปัจจุบันที่ freeze public API แล้ว งานใหม่หลังจากนี้ต้องเป็น additive
ภายใน `1.x` หรือ breaking change ใน `2.0`

## Benchmark และ soak evidence

- [Benchmark Results](./benchmark-results.html) — หน้าสรุปผลล่าสุด
- [v0.5 Core oha Report](./benchmark-oha-v05-2026-09-14.md) — release benchmark
- [JWT Security Report](./benchmark-jwt-v05-2026-09-14.md) — public/protected matrix
- [v0.5.1 Route Fast-Path Report](./benchmark-route-fast-path-v051-2026-09-14.md)
- [Roadmap Benchmark Smoke](./benchmark-roadmap-smoke-2026-09-14.md)
- [Short v1.0 Performance Evidence](./benchmark-short-v1-2026-09-15.md) — 4 route counts × 8 workloads × 3 samples
- [Historical 10-round Snapshot](./benchmark-10-rounds.md)
- [Historical 100-round Snapshot](./benchmark-100-rounds.md)
- [1M/10M Soak Report](./soak-roadmap-rerun-2026-09-14.md)
- [Current 1M/10M Soak Evidence](./soak-roadmap-rerun-2026-09-15.md) — fresh request-count gates after v0.6 changes
- [Runtime Contract Evidence](./benchmark-runtime-contract-2026-09-15.md) — inject/network parity, fuzz and memory bursts
- [Original Soak Report](./soak-v05-2026-09-14.md)
- [Compatibility Snapshot](./benchmark-oha-2026-09-14.md)

กติกาการอ่านผล: benchmark ต้องระบุ runner, fixture, runtime, hardware,
concurrency, duration และ failures ให้ครบ ห้ามรวมตัวเลขจากคนละ harness เป็น
speedup เดียวกัน

## Release, deployment และ operations

- [v1.0 Guide](./v1.0.md) — public contract และสถานะ release ปัจจุบัน
- [v0.5 Release Gates](./v0.5-release-gates.md) — historical gate ของ v0.5 feature line
- [Compatibility Matrix](./compatibility.md) — Node, Bun, Deno, Cloudflare, Vercel
- [Production Modules](./index.html#production-modules) — upload, logger, timeout, session, roles, CSRF, cache, health
- [Package Export Map](./index.html#exports) — public exports ทั้ง 25 รายการ
- [Compiler และ CLI](./DOCUMENTATION_EN.md#16-compiler-platform--cli) — inspect, routes, doctor, dev, build, generate, client
- [Production Checklist](./DOCUMENTATION_EN.md#22-production-deployment-checklist) — ขั้นตอนก่อน deploy
- [Troubleshooting FAQ](./DOCUMENTATION_EN.md#23-troubleshooting--faq) — error และวิธีแก้

24-hour soak ยัง intentionally deferred ตามแผนผู้ใช้ และยังไม่มีการประกาศ
production readiness จาก implementation เพียงอย่างเดียว

## Historical และ archive

- [v0.1 Definition of Done](./v0.1-definition-of-done.md)
- [Superpowers Plans](./superpowers/plans/)
- [Superpowers Specs](./superpowers/specs/)
- [Legacy release notes](../CHANGELOG.md)

## คำสั่งตรวจสอบหลัก

```bash
npm run typecheck
npm test
bun test
npm run package:build
npm run package:imports
npm run docs:check
npm run framework:check
npm run benchmark:short
npm run benchmark:runtime
npm run release:check:v06

# Milestone gates (workspace API contract is frozen; release tags remain separate)
npm run release:check:v07
npm run release:check:v08
npm run release:check:v09
npm run release:check:v1
```

ผลการตรวจสอบในรอบล่าสุดและข้อที่ยัง deferred ให้ดูที่
[release-status.md](./release-status.md) ก่อนอ้างสถานะของ release
