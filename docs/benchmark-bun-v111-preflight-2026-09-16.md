# Bun Generic Preflight-Reuse Evidence — 2026-09-16 to 2026-09-18

สถานะ: `no-performance-claim` — correctness ผ่าน แต่ runner มี process
contention สูง จึงยังไม่ใช้ตัวเลขนี้เป็น speedup หรือ parity claim

## Change under test

The generic Bun path now reuses a matching `preflight` result in
`app.handle()` instead of matching the same request a second time. The reuse
identity includes method, normalized pathname, and query string. A mismatch
falls back to the normal matcher. Auth, request hooks, body parsing, schema
validation, lifecycle hooks, and error handling are unchanged.

## Environment and workload

- Runtime: Bun `1.4.0`
- Runner: `oha 1.16.0`
- Host: AMD Ryzen 5 5600, 12 logical CPUs, Linux
- CPU affinity: cores `0–5`
- Concurrency: `50`
- Warmup: `2s`
- Samples: `5s × 5`
- Route set: multi, route count `2`
- Public entrypoint: `app.listen()`
- Generic entrypoint: `createBunHandler()`
- Correctness probe: status `200`, expected JSON body, failures `0`

## Results — public `app.listen()` seeds

| Seed | Zero-arg RPS | Elysia object RPS | Delta | Dynamic RPS | Elysia dynamic RPS | Delta | Failures/mismatch |
|---|---:|---:|---:|---:|---:|---:|---:|
| `20260916` | 31,427 | 30,259 | +3.86% | 30,797 | 28,440 | +8.29% | `0 / 0` |
| `20260917` | 64,647 | 81,228 | −20.41% | 72,556 | 75,576 | −4.00% | `0 / 0` |
| `20260918` | 82,046 | 81,745 | +0.37% | 79,484 | 79,424 | +0.08% | `0 / 0` |

The same-run result is not stable within the required ±2% window across all
three seeds. The verifier therefore returns `no-performance-claim`.

## Generic `createBunHandler()` evidence

| Entrypoint / workload | Median RPS | p95 | p99 | Failures | Status/body mismatch |
|---|---:|---:|---:|---:|---:|
| Generic Standard object | 17,193 | 6.812 ms | 10.651 ms | 0 | 0 / 0 |
| Generic Standard dynamic | 16,034 | 7.298 ms | 12.252 ms | 0 | 0 / 0 |

## Route-count smoke — public `app.listen()`

These short samples verify startup, static lookup, response correctness, and
absence of duplicate handler execution. They are not performance evidence.

| Routes | Median RPS | p95 | Failures | Status/body mismatch |
|---:|---:|---:|---:|---:|
| 1 | 20,420 | 2.99 ms | 0 | 0 / 0 |
| 10 | 26,246 | 2.17 ms | 0 | 0 / 0 |
| 100 | 24,716 | 2.30 ms | 0 | 0 / 0 |
| 500 | 23,425 | 2.56 ms | 0 | 0 / 0 |

Raw machine-readable results:

- [public listener JSON](./benchmark-bun-v111-preflight-20260916.json)
- [public listener JSON — seed 20260917](./benchmark-bun-v111-preflight-20260917.json)
- [public listener JSON — seed 20260918](./benchmark-bun-v111-preflight-20260918.json)
- [generic handler JSON](./benchmark-bun-v111-generic-20260916.json)
- [verifier JSON](./benchmark-bun-v111-preflight-verifier-20260916.json)
- Verifier: `npm run benchmark:verify:bun:preflight` (`no-performance-claim`)

## Interpretation

All responses and failure counters passed. The first seed was globally
degraded: Raw Bun, Elysia, Hono, and Nelysia measured around `25k–32k RPS`,
compared with the later clean runs around `70k–86k RPS`. This cross-seed spread
is runner variance, so the evidence is correctness/entrypoint evidence only,
not a before/after performance result.

The generic handler is now measured separately from `app.listen()`. Its lower
throughput must not be presented as a production Elysia comparison because it
exercises Nelysia's generic adapter boundary while the public eligible route
uses the compiled/specialized boundary.

## Decision

- Correctness: pass.
- Route-preflight reuse: covered by parity tests, including query mismatch
  fallback.
- Performance regression gate: not passed across three seeds.
- Release claim: `no-performance-claim`; repeat on an idle, thermally stable
  runner before claiming improvement.
