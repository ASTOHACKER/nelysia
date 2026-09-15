# Nelysia Bun Performance Parity Evidence — 2026-09-16

สถานะ: ผ่าน short parity gate ใน runner เดียวกัน; ไม่ใช่ universal speedup claim

หมายเหตุ: รายงานนี้เป็น short canonical run เดียว ไม่ใช่ stability gate แบบ
3 ชุดติดกัน รายงาน [Bun stabilization evidence](./benchmark-bun-stabilization-2026-09-16.md)
บันทึก baseline pinned-CPU ล่าสุดที่ได้ `no-performance-claim`
เนื่องจาก zero-arg ต่าง `-2.57%` ในชุดแรก

## Environment

- Runner: `oha 1.16.0`
- Warmup: `1 second` per target
- Samples: `5 seconds × 3` ต่อ target; median reported
- Concurrency: `50`
- Runtime: Bun `1.4.0`
- Host: AMD Ryzen 5 5600, 12 logical CPUs, Linux
- Route set: multi-route (`/json` และ `/users/42`)
- Order seed: `20260916`
- Failures: `0` ทุก target

## Same-runner result

| Workload | Nelysia | Elysia | Difference | p95 | Failures |
|---|---:|---:|---:|---:|---:|
| `.get()` zero-arg object | 87,103 req/s | 86,983 req/s | Nelysia +0.14% | 1.05 / 1.06 ms | 0 / 0 |
| dynamic params | 80,584 req/s | 80,247 req/s | Nelysia +0.42% | 1.15 / 1.13 ms | 0 / 0 |

Additional tiers from the same run:

- `getStatic` prebuilt: `91,103 req/s`, p95 `0.98 ms`, failures `0`
- Raw Bun object: `85,595 req/s`, p95 `1.05 ms`, failures `0`
- Hono Bun object: `71,305 req/s`, p95 `1.34 ms`, failures `0`
- Nelysia standard/generic object: `42,308 req/s`, p95 `1.96 ms`, failures `0`

The raw machine-readable output is [benchmark-bun-parity-2026-09-16.json](./benchmark-bun-parity-2026-09-16.json).

## Public `app.listen()` result

คำสั่งนี้ใช้ warmup `2 seconds`, measured samples `5 seconds × 3`, concurrency `50`, deterministic shuffle seed `20260916`:

```bash
BENCH_PORT=4397 BENCH_WARMUP_SEC=2 BENCH_ORDER_SEED=20260916 npm run benchmark:oha:bun:listen
```

| Workload | Nelysia `app.listen()` | Elysia | Difference | p95 | Failures |
|---|---:|---:|---:|---:|---:|
| `.get()` zero-arg object | 81,882 req/s | 82,496 req/s | Nelysia -0.74% | 1.16 / 1.14 ms | 0 / 0 |
| dynamic params | 81,077 req/s | 81,972 req/s | Nelysia -1.09OK ท% | 1.14 / 1.14 ms | 0 / 0 |

`getStatic` prebuilt เป็น tier แยก: `89,039 req/s`, p95 `1.05 ms`, failures `0` รอบนี้อยู่ใน [public-listener JSON evidence](./benchmark-bun-listen-parity-shuffled-2026-09-16.json)

## Interpretation

The optimized Nelysia zero-arg/object path is within the planned `±2%` parity window for both the internal compiled entrypoint and the public `app.listen()` entrypoint in the recorded runs. This result does not claim that Nelysia is universally faster than Elysia across hardware, route counts, runtimes, or workloads.

The optimization is limited to the safe `static-sync` lane. Routes using auth, hooks, schema validation, context state/decorations, telemetry, native `Response`, streams, custom behavior, or errors remain on their existing fallback paths.

Node, Fetch, lifecycle, response, error, and security behavior are covered by the full regression suite and were not changed by this Bun-only optimization.
