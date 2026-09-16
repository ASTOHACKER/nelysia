# Post-v0.5.1 Benchmark Smoke Evidence — 2026-09-14

> **Archived — historical smoke, not current.** Current package คือ `v1.2.1`; ดู evidence ล่าสุดที่ [benchmark-latest-readable-2026-09-16.md](./benchmark-latest-readable-2026-09-16.md).

This is a runner smoke after the roadmap changes. It verifies that the revised
Bun workload taxonomy, Hono comparison, RSS sampling, and failure accounting
execute successfully. It is **not** the release gate: the release gate remains
warmup excluded, 30 seconds × 7 samples, concurrency 50.

## Environment

AMD Ryzen 5 5600 (6 cores / 12 threads), Linux 6.18.50-2-cachyos-lts x86_64,
Node.js v26.8.2, Bun 1.4.0, oha 1.16.0, concurrency 50, multi-route fixture,
one measured 1-second sample per target.

## Bun results

| Workload | Target | Median req/s | p95 | p99 | Failures | RSS before/after |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| JSON `/json` | Raw Bun | 105,638 | 0.66 ms | 0.98 ms | 0 | 71,732 / 76,260 kB |
| JSON `/json` | Nelysia `static-prebuilt` | 105,603 | 0.68 ms | 0.97 ms | 0 | 72,076 / 86,516 kB |
| JSON `/json` | Nelysia `static-sync` | 96,859 | 0.78 ms | 1.07 ms | 0 | 72,292 / 85,332 kB |
| JSON `/json` | Nelysia standard adapter | 57,883 | 1.24 ms | 1.64 ms | 0 | 71,916 / 89,164 kB |
| JSON `/json` | Elysia | 100,068 | 0.85 ms | 1.18 ms | 0 | 67,380 / 83,296 kB |
| JSON `/json` | Hono (Bun) | 84,125 | 1.00 ms | 1.38 ms | 0 | 68,928 / 83,980 kB |
| Dynamic `/users/42` | Raw Bun | 92,564 | 0.93 ms | 1.36 ms | 0 | 70,124 / 76,176 kB |
| Dynamic `/users/42` | Nelysia params compiled | 85,584 | 1.04 ms | 1.81 ms | 0 | 72,228 / 85,400 kB |
| Dynamic `/users/42` | Nelysia standard adapter | 51,562 | 1.58 ms | 2.41 ms | 0 | 70,228 / 88,176 kB |
| Dynamic `/users/42` | Elysia | 96,532 | 0.88 ms | 1.24 ms | 0 | 72,272 / 86,300 kB |
| Dynamic `/users/42` | Hono (Bun) | 87,273 | 0.97 ms | 1.41 ms | 0 | 70,952 / 86,104 kB |

The smoke sample gives `static-sync` a 67.3% median advantage over the standard
Nelysia adapter in this same sample (`96,859 / 57,883 - 1`). Because it is one
short sample, it is recorded only as a diagnostic signal and is not used as a
release speedup claim.

Reproduce the release-strength command with:

```bash
BENCH_ROUTE_SET=single npm run benchmark:oha:route:release
BENCH_ROUTE_SET=multi npm run benchmark:oha:route:release
```
