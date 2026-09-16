# Benchmark ล่าสุด — Nelysia Runtime Parity / Win Matrix

หลักฐานชุดนี้: Bun `1.4.0`, `app.listen()`, 2 routes, concurrency 50,
5 วินาที × 5 รอบ, 3 seeds (`20261011`, `20261012`, `20261013`) บน AMD Ryzen 5
5600, `oha 1.16.0` โดย baseline คือ Elysia `2.0.0-exp.60`

สถานะ release gate: **`BLOCKED` / `NO PERFORMANCE CLAIM`**

Bun runtime-parity verifier เดิมผ่าน correctness, stability และ compiled ±2% /
generic ≥90% gate แต่ Win Matrix ใหม่ต้องการ Bun throughput ของทุก workload
ไม่น้อยกว่า Elysia รวมถึง Node, Fetch/Edge, memory, ecosystem และ 24-hour soak
ซึ่งยังมีหลักฐานไม่ครบ ดู machine-readable manifest ที่
[`benchmark-win-matrix-2026-09-16.json`](./benchmark-win-matrix-2026-09-16.json)

## ตารางสรุป

| Workload | Nelysia | Elysia | เทียบ Elysia | p95 Nelysia | สถานะ |
|---|---:|---:|---:|---:|---|
| Zero-arg specialized JSON | 93,061 RPS | 92,537 RPS | **100.6%** | 0.97 ms | ผ่าน ±2% |
| Params compiled dynamic | 90,002 RPS | 89,000 RPS | **101.1%** | 1.00 ms | ผ่าน ±2% |
| Generic JSON (opaque) | 75,650 RPS | 77,665 RPS | **97.4%** | 1.18 ms | Bun legacy gate ผ่าน; Win Matrix ยังไม่ผ่าน |
| Generic dynamic (opaque) | 75,290 RPS | 76,489 RPS | **98.4%** | 1.18 ms | Bun legacy gate ผ่าน; Win Matrix ยังไม่ผ่าน |

## Latency summary

| Workload | Nelysia p95 | Elysia p95 | Nelysia p99 | Elysia p99 | สถานะ latency gate |
|---|---:|---:|---:|---:|---|
| Zero-arg specialized JSON | 0.971 ms | 0.976 ms | 1.460 ms | 1.468 ms | ผ่าน 2% |
| Params compiled dynamic | 0.997 ms | 1.016 ms | 1.500 ms | 1.522 ms | ผ่าน 2% |
| Generic JSON (opaque) | 1.176 ms | 1.137 ms | 1.712 ms | 1.695 ms | ไม่ผ่าน p95 2% |
| Generic dynamic (opaque) | 1.178 ms | 1.162 ms | 1.749 ms | 1.707 ms | ไม่ผ่าน p99 2% |

## Correctness / stability

| Check | ผล |
|---|---:|
| Success rate | 100% ทุก Bun target |
| Failures | 0 |
| Status/body mismatch | 0 |
| Seed spread | ≤10% ทุก target |
| Bun runtime parity verifier (legacy gate) | **PASS** |
| Full Win Matrix verifier | **BLOCKED** |

Throughput ใช้ aggregate median จาก 3 seeds; correctness และ stability ตรวจแยกทุก seed

ตรวจซ้ำ:

```bash
npm run benchmark:verify:runtime-parity
npm run benchmark:verify:win-matrix
```

Raw results:

- `docs/benchmark-runtime-parity-20261011.json`
- `docs/benchmark-runtime-parity-20261012.json`
- `docs/benchmark-runtime-parity-20261013.json`
