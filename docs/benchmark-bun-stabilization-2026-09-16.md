# Bun Performance Stabilization Evidence — 2026-09-16

สถานะ: `no-performance-claim` — correctness ผ่าน แต่ยังไม่ผ่าน stability gate
แบบ 3 ชุดติดต่อกัน

## Baseline ชุดที่ 1

คำสั่งนี้ใช้ Bun `app.listen()` จริง, CPU affinity cores `0–5`, warmup `2s`,
วัด `5s × 5`, concurrency `50`, route count `2` และ order seed `20260916`:

```bash
taskset -c 0-5 env BENCH_PORT=4400 BENCH_SUITE=bun BENCH_ENTRYPOINT=listen \
  BENCH_ROUTE_SET=multi BENCH_ROUTE_COUNT=2 BENCH_DURATION_SEC=5 \
  BENCH_WARMUP_SEC=2 BENCH_CONCURRENCY=50 BENCH_ROUNDS=5 \
  BENCH_ORDER_SEED=20260916 \
  BENCH_OUTPUT=docs/benchmark-bun-stabilization-2026-09-16.json \
  npm run benchmark:oha:bun:listen
```

| Workload | Nelysia | Elysia | Difference | Failures | Probe |
|---|---:|---:|---:|---:|---:|
| zero-arg object | 88,219 req/s | 90,544 req/s | -2.57% | 0 / 0 | status/body pass |
| dynamic params | 88,373 req/s | 88,851 req/s | -0.54% | 0 / 0 | status/body pass |

The zero-arg result is outside the planned `±2%` window. The strict
three-consecutive-run gate therefore remains incomplete and no speedup/parity
claim is made from this baseline.

Raw result: [benchmark-bun-stabilization-2026-09-16.json](./benchmark-bun-stabilization-2026-09-16.json)

## Profile and variance check

`perf stat -d -r 3` was run with the same CPU affinity and workload against
Nelysia and Elysia object targets. Nelysia's separate medians were `89,761`,
`87,563`, and `88,421 req/s`. Elysia's control medians were `87,395`,
`71,656`, and `74,833 req/s`. All control runs passed the status/body probe and
reported zero request failures, but the control itself varied substantially.

This profile command measures the benchmark orchestrator and its spawned
workload, so its counters are runner evidence rather than a direct per-server
CPU attribution. The observed control variance is sufficient to block a code
change based only on the first `-2.57%` result. Repeated runs must be made on
an idle, thermally stable runner before attributing the gap to Nelysia.

## Decision

- Correctness: pass; all requests, status probes and JSON body probes passed.
- Performance stability: not passed; only one of the required three baseline
  sets was collected, and its zero-arg comparison was `-2.57%`.
- Runtime code: no additional optimization was applied after this result.
- Next action: rerun the three-seed matrix on an isolated/idle runner, or use a
  direct server-process profiler before changing `fastJson`, lookup, or the
  Bun server boundary.
- Release: do not bump version, publish, tag, or announce performance parity.
