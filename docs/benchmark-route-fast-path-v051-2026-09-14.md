# v0.5.1 Bun Route Fast-Path Benchmark Evidence — 2026-09-14

> **Archived — v0.5.x evidence, not current.** Current package คือ `v1.2.1`; ดู evidence ล่าสุดที่ [benchmark-latest-readable-2026-09-16.md](./benchmark-latest-readable-2026-09-16.md).

This report records the v0.5.1 patch benchmark for the Bun compiled-dispatcher
regression. It uses one runner, one host, warmup excluded, 30 seconds per
sample, 7 measured samples, concurrency 50, and `oha 1.16.0`. The benchmark
does not compare against the historical 91k result because that result used a
different fixture and harness.

Environment: AMD Ryzen 5 5600 (6 cores / 12 threads), Linux, Node.js v26.8.2,
Bun 1.4.0, oha 1.16.0. All reported targets completed with 100% success and
zero failures. Latency values are from the same seven-sample median report.

## Workload definition

- `static-prebuilt`: `.getStatic("/json", value)` served from the pre-serialized map.
- `static-sync`: `.get("/json", () => value)` served from `staticFunctionMap` without request-context allocation.
- params-only: `.get("/users/:id", ({ params }) => value)` using the compiled parameter path.
- standard: the same Nelysia route fixtures through the standard Bun adapter.
- single route: only the requested route is registered.
- multi route: the requested route plus the other benchmark route are registered.

The release command is reproducible with:

```bash
BENCH_ROUTE_SET=single npm run benchmark:oha:route:release
BENCH_ROUTE_SET=multi npm run benchmark:oha:route:release
```

## Multi-route fixture

| Workload | Framework | Median req/s | Min/Max req/s | p95 | p99 | Failures |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| JSON `/json` | Raw Bun | 88,348 | 76,055 / 95,207 | 1.03 ms | 1.63 ms | 0 |
| JSON `/json` | Nelysia `static-prebuilt` | 95,268 | 86,661 / 97,955 | 0.91 ms | 1.36 ms | 0 |
| JSON `/json` | Nelysia `static-sync` | 88,300 | 86,109 / 90,412 | 0.99 ms | 1.53 ms | 0 |
| JSON `/json` | Nelysia standard adapter | 49,294 | 46,660 / 49,499 | 1.69 ms | 2.35 ms | 0 |
| JSON `/json` | Elysia | 86,752 | 83,127 / 88,893 | 1.03 ms | 1.58 ms | 0 |
| Dynamic `/users/42` | Raw Bun | 87,954 | 84,303 / 89,383 | 1.00 ms | 1.53 ms | 0 |
| Dynamic `/users/42` | Nelysia params-only | 84,072 | 81,693 / 87,446 | 1.06 ms | 1.65 ms | 0 |
| Dynamic `/users/42` | Nelysia standard adapter | 45,433 | 43,712 / 46,649 | 1.87 ms | 2.56 ms | 0 |
| Dynamic `/users/42` | Elysia | 84,230 | 76,107 / 85,587 | 1.11 ms | 1.72 ms | 0 |

## Single-route fixture

| Workload | Framework | Median req/s | Min/Max req/s | p95 | p99 | Failures |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| JSON `/json` | Raw Bun | 92,407 | 83,371 / 94,038 | 0.98 ms | 1.51 ms | 0 |
| JSON `/json` | Nelysia `static-prebuilt` | 91,619 | 88,821 / 92,940 | 0.97 ms | 1.51 ms | 0 |
| JSON `/json` | Nelysia `static-sync` | 93,617 | 90,023 / 96,096 | 0.93 ms | 1.38 ms | 0 |
| JSON `/json` | Nelysia standard adapter | 54,479 | 52,739 / 54,980 | 1.49 ms | 2.01 ms | 0 |
| JSON `/json` | Elysia | 93,028 | 90,560 / 95,701 | 0.93 ms | 1.44 ms | 0 |
| Dynamic `/users/42` | Raw Bun | 93,422 | 90,521 / 94,564 | 0.94 ms | 1.41 ms | 0 |
| Dynamic `/users/42` | Nelysia params-only | 93,478 | 87,258 / 93,998 | 0.93 ms | 1.40 ms | 0 |
| Dynamic `/users/42` | Nelysia standard adapter | 49,727 | 48,615 / 50,421 | 1.62 ms | 2.18 ms | 0 |
| Dynamic `/users/42` | Elysia | 93,387 | 92,773 / 94,467 | 0.93 ms | 1.39 ms | 0 |

## Gate interpretation

The zero-argument specialized median is compared with the standard Nelysia Bun
adapter in the same JSON fixture:

- multi route: `(88,300 / 49,294) - 1 = +79.1%`
- single route: `(93,617 / 54,479) - 1 = +71.8%`

Both route sets exceed the `standard median × 1.10` target. The `/json` route
classifies as `static-sync`, and the dispatcher tests cover exact path, trailing
slash, multi-route lookup, native responses, streams, errors, and no
double-execution behavior. This is a same-runner patch result, not a universal
claim that Nelysia is faster than Raw Bun or Elysia.

No v0.5.0 tag was created or moved; the shipped patch tag and release are
v0.5.1. This patch report does not close the separate 24-hour soak or npm
publication gates. The completed JWT benchmark
evidence is recorded in [`benchmark-jwt-v05-2026-09-14.md`](./benchmark-jwt-v05-2026-09-14.md).
