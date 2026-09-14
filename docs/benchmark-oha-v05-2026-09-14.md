# v0.5.0 Release Benchmark Evidence — 2026-09-14

This report uses the new release runner with a warmup excluded from measurement,
30 seconds per sample, 7 measured samples, concurrency 50, and `oha 1.16.0`.
Environment: AMD Ryzen 5 5600 (6 cores / 12 threads), Linux, Node.js v26.8.2,
Bun 1.4.0. Every reported target completed with 100% success and zero failures.
The runner also records min/max throughput across the seven samples and p95/p99
latency; no number below should be compared with a different harness.

## Bun

| Workload | Framework | Median req/s | Min/Max req/s | p95 | p99 | Failures |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| JSON `/json` | Raw Bun | 72,564 | 64,177 / 83,707 | 1.37 ms | 2.34 ms | 0 |
| JSON `/json` | Nelysia static compiled | 73,265 | 66,671 / 79,719 | 1.30 ms | 2.18 ms | 0 |
| JSON `/json` | Nelysia route compiled | 37,751 | 31,624 / 39,035 | 2.34 ms | 3.33 ms | 0 |
| JSON `/json` | Nelysia standard adapter | 38,776 | 35,669 / 40,854 | 2.22 ms | 3.11 ms | 0 |
| JSON `/json` | Elysia | 70,249 | 66,574 / 71,930 | 1.34 ms | 2.16 ms | 0 |
| Dynamic `/users/42` | Raw Bun | 71,493 | 64,695 / 76,617 | 1.33 ms | 2.12 ms | 0 |
| Dynamic `/users/42` | Nelysia params compiled | 68,939 | 66,172 / 75,920 | 1.40 ms | 2.24 ms | 0 |
| Dynamic `/users/42` | Nelysia standard adapter | 38,488 | 34,829 / 39,723 | 2.22 ms | 3.12 ms | 0 |
| Dynamic `/users/42` | Elysia | 81,319 | 77,614 / 83,477 | 1.10 ms | 1.72 ms | 0 |

## Node.js

| Workload | Framework | Median req/s | Min/Max req/s | p95 | p99 | Failures |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| JSON `/json` | Raw Node | 39,108 | 33,477 / 46,038 | 2.36 ms | 3.92 ms | 0 |
| JSON `/json` | Nelysia | 21,314 | 19,062 / 22,897 | 3.90 ms | 6.14 ms | 0 |
| JSON `/json` | Fastify 5 | 33,117 | 30,449 / 43,828 | 2.63 ms | 3.59 ms | 0 |
| JSON `/json` | Express 5 | 17,657 | 16,551 / 18,309 | 4.01 ms | 5.73 ms | 0 |
| Dynamic `/users/42` | Raw Node | 36,906 | 34,553 / 37,765 | 2.32 ms | 3.48 ms | 0 |
| Dynamic `/users/42` | Nelysia | 32,288 | 29,390 / 34,775 | 2.64 ms | 3.82 ms | 0 |
| Dynamic `/users/42` | Fastify 5 | 32,121 | 29,926 / 41,235 | 2.62 ms | 3.67 ms | 0 |
| Dynamic `/users/42` | Express 5 | 17,237 | 16,158 / 18,078 | 4.24 ms | 5.94 ms | 0 |

The Node dynamic result is below the historical 35k directional target on this
runner, so v0.5.0 makes no hard promise for that number. The result is recorded
as a regression signal and should be investigated on the historical runner and
release hardware before making a performance claim.

The JWT release command is separate because public, valid, missing, invalid, and
expired-token requests have different security costs:

```bash
npm run benchmark:jwt:release
```

The full JWT 30s × 7 evidence and the 24-hour soak remain release-candidate gates.
