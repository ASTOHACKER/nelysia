# `oha` Benchmark Report — 2026-09-14

Latest 10-round local load-generator run for the current v0.4.0 workspace. Each case used `oha 1.16.0`, 50 concurrent workers, 3 seconds per sample, 10 rounds, and zero failed requests. Values below are median throughput.

Environment: AMD Ryzen 5 5600 (6 cores / 12 threads), Bun 1.4.0, and Node.js
v26.8.1. These are local directional measurements, not universal framework
rankings; rerun on a quiet, production-like host before publishing performance
claims.

## Node.js

| Workload | Raw Node | Nelysia | Fastify | Express |
| --- | ---: | ---: | ---: | ---: |
| JSON | 47,572 req/s | 27,451 req/s | 38,879 req/s | 21,130 req/s |
| Dynamic params | 47,607 req/s | 40,919 req/s | 38,846 req/s | 20,527 req/s |

## Bun

| Workload | Raw Bun | Nelysia | Elysia | Other baseline |
| --- | ---: | ---: | ---: | ---: |
| Static JSON | 95,306 req/s | 95,173 req/s | 76,062 req/s | Route Compiled 44,153; Standard Bun 40,464 |
| Dynamic params | 82,904 req/s | 83,855 req/s | 82,816 req/s | Standard Bun 41,945 |

In this 10-round run, Nelysia static JSON was effectively tied with raw Bun
(-0.1%) and 25.1% above Elysia. Nelysia dynamic Bun was 1.1% above raw Bun and
1.3% above Elysia. On Node, Nelysia trailed the JSON baseline by 42.3% and the
dynamic baseline by 14.0%, while beating Fastify by 5.3% on the dynamic route
and Express in both workloads. These are reproducible local observations, not
universal framework rankings; rerun on the deployment hardware before making
performance claims.

## Previous 3-round `oha` run sets

The immediately preceding repeat (#2) used 5 seconds per sample and 3 rounds.
Its medians were: Node JSON raw/Nelysia/Fastify/Express
`44,527/25,445/38,498/20,798` req/s; Node dynamic
`47,511/39,764/38,459/20,231` req/s; Bun static raw/Nelysia/Elysia
`93,288/85,455/84,788` req/s; and Bun dynamic `80,616/83,145/81,773`
req/s. The preceding repeat (#1) is also retained in the earlier report record:
Node JSON `54,449/29,126/56,925/24,801`, Node dynamic
`41,633/42,825/55,073/23,456`, Bun static `102,408/102,580/100,458`, and Bun
dynamic `94,359/92,531/93,368` req/s. All run sets had 100% success.

The movement between local run sets shows why a single benchmark number is not
a code-only speed claim. CPU scheduling, thermal state, process noise, and
loopback/load-generator timing can materially affect short local runs. The
10-round set is the stronger current snapshot, but compare like-for-like runs
on a quiet, production-like host before publishing a performance claim.

Reproduce with:

```bash
npm run benchmark:oha:node
BENCH_PORT=4331 npm run benchmark:oha:bun
```

## Same-runner comparison with the historical ten-round report

To check whether the implementation moved relative to the repository's older
benchmark, the original runner was repeated on the same workspace with the
historical settings: 1 second per sample, 10 concurrent workers, 10 samples,
and zero failures. This is a directional regression check, not a laboratory
controlled code-only comparison; runtime, dependency, kernel, and machine
load can still change between dates.

| Workload | Historical Nelysia | 2026-09-14 rerun | Change |
| --- | ---: | ---: | ---: |
| Bun static (`GET /json`) | 30,618 req/s | 57,011 req/s | +86.2% |
| Bun dynamic (`GET /users/:id`) | 28,991 req/s | 37,590 req/s | +29.7% |
| Node JSON (`GET /json`) | 5,208 req/s | 5,872 req/s | +12.7% |

The relative picture matters more than the raw delta. In the rerun, Bun static
Nelysia was effectively tied with raw Bun (+0.1%) but 1.6% below Elysia; Bun
dynamic was 8.4% below raw Bun and 0.5% above Elysia. Node JSON was 9.4% above
the raw Node baseline in this particular run. The detailed historical source is
[`docs/benchmark-10-rounds.md`](./benchmark-10-rounds.md).

The current `oha` run uses a different load generator and a higher concurrency
of 50, so its values must not be compared arithmetically with the historical
runner table. It is the authoritative current load-generator snapshot; the
same-runner table above is the useful directional trend check.
