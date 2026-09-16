# Nelysia Runtime Parity Benchmark

ผล benchmark นี้เป็นค่ามัธยฐานของ 3 seeds (`20261011`, `20261012`, `20261013`) โดยเป็น fixture เดียวกันทั้ง Nelysia และ Elysia: generic handlers ใช้ dynamic context key จริง

## Configuration

| รายการ | ค่า |
|---|---|
| Runtime | Bun 1.4.0 |
| Entrypoint | `app.listen()` |
| Workload | 2 routes, multi-route |
| Duration | 5 วินาที × 5 รอบ |
| Warmup | 2 วินาที |
| Concurrency | 50 |
| Machine | AMD Ryzen 5 5600, 12 cores |
| Toolchain | Node v26.3.0, oha 1.16.0 |

## Results

| Workload | Nelysia RPS | Elysia RPS | เทียบ Elysia | Nelysia p95 | Result |
|---|---:|---:|---:|---:|---|
| Zero-arg specialized JSON | 93,061 | 92,537 | **100.6%** | 0.97 ms | Pass (±2%) |
| Params compiled dynamic | 90,002 | 89,000 | **101.1%** | 1.00 ms | Pass (±2%) |
| Generic JSON (opaque) | 75,650 | 77,665 | **97.4%** | 1.18 ms | Pass (≥90%) |
| Generic dynamic (opaque) | 75,290 | 76,489 | **98.4%** | 1.18 ms | Pass (≥90%) |

## Correctness and stability

| Check | Result |
|---|---:|
| Seeds | 3/3 |
| Success rate | 100% ทุก target |
| Failures | 0 |
| Status/body mismatch | 0 |
| Seed spread | ≤10% ทุก target |
| Runtime parity verifier | **PASS** |

เกณฑ์ throughput ใช้ aggregate median ของ 3 seeds เพื่อลด process/order noise; correctness และ stability ตรวจแยกทุก seed

ตรวจซ้ำด้วย:

```bash
npm run benchmark:verify:runtime-parity
```

ไฟล์ raw results:

- `benchmark-runtime-parity-20261011.json`
- `benchmark-runtime-parity-20261012.json`
- `benchmark-runtime-parity-20261013.json`

ผลนี้ยืนยันเฉพาะ Bun runtime parity gate ของ milestone นี้ ยังไม่ใช่ผล 24-hour soak, Node throughput parity หรือ validation-cost benchmark.
