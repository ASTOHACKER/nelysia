# Nelysia Runtime Evidence — 2026-09-16

สถานะ: short regression evidence สำหรับงานหลัง `v1.0.0` ยังไม่ใช่ release claim

## Environment

- Runner: `oha 1.16.0`
- Warmup: runner startup ก่อนเริ่ม sample
- Samples: public Bun listener `3 seconds × 3`; all-framework short run `5 seconds × 3` (ไม่ใช่ release gate)
- Concurrency: `50`
- Runtime: Bun `1.4.0`
- Host: AMD Ryzen 5 5600, 12 logical CPUs, Linux
- Workload: multi-route fixture เดียวกัน (`/json` และ `/users/42`)
- Failures: `0` ทุก sample ที่รายงานด้านล่าง

## Public Bun `app.listen()`

คำสั่งที่ใช้:

```bash
BENCH_PORT=4395 BENCH_DURATION_SEC=3 BENCH_ROUNDS=3 BENCH_CONCURRENCY=50 npm run benchmark:oha:bun:listen
```

| Workload | Median req/s | p95 | Failures |
|---|---:|---:|---:|
| `getStatic` prebuilt `/json` | 79,158 | 1.15 ms | 0 |
| `.get()` zero-arg `/json` | 74,381 | 1.22 ms | 0 |
| params `/users/42` | 69,297 | 1.34 ms | 0 |
| standard handler `/json` | 41,429 | 2.09 ms | 0 |
| standard handler `/users/42` | 35,217 | 2.52 ms | 0 |

## All-framework short run: internal handler entrypoint

คำสั่งที่ใช้คือ `BENCH_PORT=4391 BENCH_OUTPUT=docs/benchmark-runtime-v11-final.json BENCH_ORDER_SEED=20260916 npm run benchmark:oha:short` โดย Bun ใช้ compiled handler boundary และ Node ใช้ adapter server ตาม runner; ผลนี้ไม่ใช่ผลของ public `app.listen()` ของ Bun

| Runtime / Workload | Raw | Nelysia | Peer baselines | Failures |
|---|---:|---:|---:|---:|
| Bun object JSON | 76,543 | 75,317 (zero-arg) | Elysia 79,297; Hono 71,354 | 0 |
| Bun dynamic params | 80,360 | 76,234 (params) | Elysia 76,258; Hono 73,595 | 0 |
| Node object JSON | 44,772 | 41,099 | Fastify 29,985; Express 18,032; Hono 16,766 | 0 |
| Node dynamic params | 42,545 | 36,883 | Fastify 34,004; Express 16,320; Hono 15,517 | 0 |

`getStatic` prebuilt เป็น tier แยก: `85,871 req/s`, p95 `1.10 ms`, failures `0` ใน run เดียวกัน รายละเอียด p50/p95/p99, RSS/heap และค่ารายรอบอยู่ใน [final machine-readable evidence](./benchmark-runtime-v11-final.json)

## All-framework Node `listen(0) → HTTP client`

| Workload | Raw Node | Nelysia | Fastify | Express | Hono | Failures |
|---|---:|---:|---:|---:|---:|---:|
| JSON object serialization | 44,286 | 44,210 | 34,410 | 19,108 | 17,071 | 0 |
| Dynamic params | 42,168 | 37,309 | 35,766 | 17,795 | 16,573 | 0 |

รายละเอียด public Bun `app.listen()` อยู่ใน [Bun JSON evidence](./benchmark-runtime-v11-latest.json) และ Node adapter run อยู่ใน [Node JSON evidence](./benchmark-runtime-v11-node-latest.json)

ตัวเลขนี้ใช้เพื่อยืนยันว่า public `app.listen()` วิ่งผ่าน handler ที่เตรียมไว้ครั้งเดียวและไม่มี functional failure เท่านั้น ห้ามนำไปเทียบกับ historical benchmark ที่ใช้ fixture, route set หรือ runner คนละชุด

## Interpretation

The newer focused Bun parity run is documented separately in
[benchmark-bun-parity-2026-09-16.md](./benchmark-bun-parity-2026-09-16.md) and uses
the public `app.listen()` entrypoint with a 2-second warmup and deterministic
target shuffle. It measured Nelysia at `81,882 req/s` versus Elysia at
`82,496 req/s` for zero-argument object responses (`-0.74%`), and `81,077`
versus `81,972 req/s` for dynamic params (`-1.09%`), with zero failures. The
older tables above remain as their own recorded baseline and must not be mixed
with that run.

- `getStatic`, zero-arg และ params ใช้ internal specialized subtiers คนละแบบ จึงไม่ควรรวมเป็นตัวเลขเดียว
- standard handler ยังคงเป็น generic reference path และมีต้นทุนสูงกว่าอย่างเห็นได้ชัดใน fixture นี้
- ผล Node dynamic ใน short run นี้ยังต่ำกว่า Raw Node ราว 13%; จึงยังไม่มี speedup claim และควรใช้เป็น regression baseline สำหรับ v1.1.1
- ตัวเลขขึ้นกับ CPU, kernel, Bun, oha, concurrency และ process contention จึงไม่ใช่ hard promise ข้ามเครื่อง
- 24-hour soak และ production readiness ยังคง deferred
