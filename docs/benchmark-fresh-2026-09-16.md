# Fresh Benchmark Evidence — 2026-09-16 (oha-short suite)

Status: short-suite evidence on the current dirty tree. Single-run medians, not a
3-seed stability gate. No universal performance claim.

## What was measured

Four suites ran back-to-back on one idle runner (load ~0.3 at start):

```bash
node --experimental-strip-types benchmarks/verify-short.ts
node --experimental-strip-types benchmarks/verify-runtime.ts
BENCH_PORT=4371 BENCH_SUITE=bun BENCH_ENTRYPOINT=listen BENCH_DURATION_SEC=5 \
  BENCH_WARMUP_SEC=2 BENCH_CONCURRENCY=50 BENCH_ROUNDS=3 \
  BENCH_ORDER_SEED=20260916 BENCH_OUTPUT=docs/benchmark-fresh-bun-listen-20260916.json \
  node --experimental-strip-types benchmarks/run-oha.ts
BENCH_DURATION_SEC=5 BENCH_CONCURRENCY=50 BENCH_ROUNDS=3 \
  BENCH_OUTPUT=docs/benchmark-fresh-all-20260916.json \
  node --experimental-strip-types benchmarks/run-oha.ts
```

(`npm run` wrappers were bypassed with direct `node` invocation after `npm`
printed a spurious `ENOENT /home/narudom/package.json` error yet still executed;
direct invocation removes that ambiguity. Exit codes were `0` for every suite.)

## Code under test

HEAD `d08d161` (v1.1.0 release commit) **plus uncommitted changes** — results
belong to the dirty tree, not to the release tag:

- `M packages/core/src/app.ts`, `M packages/core/src/types.ts`
- `M packages/runtime-bun/src/handler.ts`
- `M benchmarks/run-oha.ts`, `M tests/compiled-dispatcher.test.ts`
- `M package.json`, `M docs/README.md`

## Environment

| Field | Value |
|---|---|
| CPU | `AMD Ryzen 5 5600 6-Core Processor` (12 threads) |
| OS/kernel | `linux 6.18.50-2-cachyos-lts` |
| Node | `v26.8.2` |
| Bun | `1.4.0` |
| oha | `oha 1.16.0` |
| memory | `23.39 GiB` |
| run time | `2026-09-16 ~05:45–06:00 +07` |

## 1. Short regression matrix (in-process `app.handle()`)

Warmup `2.5s`, measured `5s × 3` per workload, concurrency `50`, routes
`1/10/100/500` × 8 workloads. All 32 combos, 96 samples, **0 failures**.
RPS is the median of 3 repeats (recomputed from per-repeat samples in
[benchmark-fresh-short-20260916.json](./benchmark-fresh-short-20260916.json)).

| Routes | Workload | Median req/s | Min | Max | Failures |
|---:|---|---:|---:|---:|---:|
| 1 | static | 1,918,398 | 1,918,076 | 1,925,892 | 0 |
| 1 | params | 1,117,824 | 1,112,967 | 1,128,897 | 0 |
| 1 | query | 525,860 | 517,563 | 527,376 | 0 |
| 1 | body | 564,292 | 557,930 | 568,744 | 0 |
| 1 | schema | 363,880 | 361,810 | 365,572 | 0 |
| 1 | jwt | 47,097 | 45,970 | 47,172 | 0 |
| 1 | hooks | 538,040 | 530,050 | 542,190 | 0 |
| 1 | combined | 38,334 | 38,196 | 38,544 | 0 |
| 10 | static | 1,732,059 | 1,723,172 | 1,732,552 | 0 |
| 10 | params | 1,024,729 | 996,971 | 1,029,727 | 0 |
| 10 | query | 488,522 | 486,450 | 496,440 | 0 |
| 10 | body | 547,022 | 546,300 | 553,033 | 0 |
| 10 | schema | 349,620 | 349,560 | 352,600 | 0 |
| 10 | jwt | 44,731 | 44,639 | 45,092 | 0 |
| 10 | hooks | 524,281 | 519,044 | 525,394 | 0 |
| 10 | combined | 37,661 | 37,290 | 37,868 | 0 |
| 100 | static | 1,726,823 | 1,691,429 | 1,741,500 | 0 |
| 100 | params | 1,060,320 | 1,058,121 | 1,063,543 | 0 |
| 100 | query | 478,060 | 477,512 | 492,920 | 0 |
| 100 | body | 532,190 | 483,391 | 538,901 | 0 |
| 100 | schema | 343,010 | 341,228 | 346,630 | 0 |
| 100 | jwt | 45,557 | 45,332 | 45,642 | 0 |
| 100 | hooks | 520,496 | 494,704 | 535,030 | 0 |
| 100 | combined | 37,680 | 37,638 | 38,621 | 0 |
| 500 | static | 1,726,821 | 1,724,743 | 1,733,094 | 0 |
| 500 | params | 1,069,869 | 1,067,343 | 1,079,631 | 0 |
| 500 | query | 479,540 | 469,485 | 485,840 | 0 |
| 500 | body | 519,454 | 508,051 | 524,960 | 0 |
| 500 | schema | 338,050 | 337,680 | 345,680 | 0 |
| 500 | jwt | 43,168 | 42,076 | 43,644 | 0 |
| 500 | hooks | 527,430 | 516,680 | 539,716 | 0 |
| 500 | combined | 36,736 | 36,322 | 37,336 | 0 |

Note: per-row p95/p99 from this runner's stdout were lost to a log-capture
corruption (stdout file filled with NUL bytes except the final row); RPS
medians above come from the intact machine-readable samples and are unaffected.
Latency evidence for this run comes from the oha sections below instead.

Same-harness observation vs
[benchmark-short-v1-2026-09-15.md](./benchmark-short-v1-2026-09-15.md)
(identical `verify-short` settings, routes=1): static `488k → 1,918k`
(+293%), params `411k → 1,118k` (+172%), query/body/schema/hooks +16–24%, jwt
`43.3k → 47.1k` (+9%), combined `36.8k → 38.3k` (+4%). The static/params jump
matches the uncommitted compiled-dispatcher work; crypto-bound jwt/combined
barely moved, as expected. This is a same-harness observation, not a release
claim — and correctness of the faster path is covered by the runtime gate
below, which compares `inject` against a real socket server response-for-response.

## 2. Runtime contract gate

[`benchmark-fresh-runtime-20260916.json`](./benchmark-fresh-runtime-20260916.json).
Fuzz `1,000` cases (`inject` vs `listen(0) → fetch()`), bursts 10k/50k/100k.

| Check | Result |
|---|---:|
| fuzz failures / status mismatches | `0 / 0` |
| route mix | `334 static / 334 dynamic / 332 404` |
| runtime errors / process exit | `0 / success` |
| burst 10k | `0` failures, `443,679` req/s |
| burst 50k | `0` failures, `710,936` req/s |
| burst 100k | `0` failures, `946,857` req/s |

## 3. Public Bun `app.listen()` (oha, 5s × 3, conc 50, seed 20260916)

[`benchmark-fresh-bun-listen-20260916.json`](./benchmark-fresh-bun-listen-20260916.json).
Warmup `2s` excluded. All targets `100%` success, `0` failures, status/body
probes passed.

| Workload | Framework | Median req/s | Min/Max | p95 | Failures |
|---|---|---:|---|---|---:|
| JSON object | Elysia | 97,494 | 97,057 / 97,920 | 0.87 ms | 0 |
| JSON object | Nelysia zero-arg | 95,618 | 94,671 / 95,682 | 0.89 ms | 0 |
| JSON object | Raw Bun | 93,567 | 93,157 / 93,673 | 0.92 ms | 0 |
| JSON object | Hono | 86,286 | 85,241 / 86,605 | 1.00 ms | 0 |
| JSON object | Nelysia standard handler | 70,654 | 70,350 / 72,275 | 1.19 ms | 0 |
| JSON object | Nelysia `getStatic` prebuilt (separate tier) | 100,992 | 98,722 / 102,643 | 0.84 ms | 0 |
| Dynamic params | Elysia | 93,622 | 93,256 / 94,641 | 0.91 ms | 0 |
| Dynamic params | Nelysia params compiled | 92,595 | 92,282 / 93,772 | 0.92 ms | 0 |
| Dynamic params | Raw Bun | 92,389 | 88,573 / 94,978 | 0.93 ms | 0 |
| Dynamic params | Hono | 83,058 | 80,218 / 84,374 | 1.03 ms | 0 |
| Dynamic params | Nelysia standard handler | 68,056 | 66,048 / 68,138 | 1.24 ms | 0 |

Parity check (single run, `±2%` window): zero-arg `95,618` vs Elysia `97,494`
(**−1.92%**, inside), dynamic `92,595` vs `93,622` (**−1.10%**, inside). This
passes the short single-run parity window but is **not** the 3-seed stability
gate, so it does not by itself clear the `no-performance-claim` status.

## 4. All-framework short run (oha, 5s × 3, conc 50)

[`benchmark-fresh-all-20260916.json`](./benchmark-fresh-all-20260916.json).
Bun targets here use the compiled handler boundary, Node targets the adapter
server; entrypoint is recorded per result. All targets `100%` success.

| Runtime / workload | Raw | Nelysia | Peers | Failures |
|---|---|---:|---|---:|
| Bun JSON object | 95,148 | 95,522 (zero-arg) | Elysia 99,066; Hono 86,354 | 0 |
| Bun dynamic params | 94,451 | 93,680 (params) | Elysia 93,960; Hono 83,593 | 0 |
| Node JSON object | 51,527 | 48,913 | Fastify 52,945; Express 23,341; Hono 20,279 | 0 |
| Node dynamic params | 51,949 | 47,365 | Fastify 51,812; Express 21,839; Hono 19,767 | 0 |

(`getStatic` prebuilt tier in this run: `101,804` req/s, p95 `0.84 ms`, 0 failures.)
Node Nelysia trails Raw Node by −5.1% (JSON) and −8.8% (dynamic) on this
runner — no Node speedup claim; keep as the v1.1.1 regression baseline.

## Interpretation

- Runner was clean this time: no degraded seed (contrast the ~30k contention
  seed in the v111 preflight series). Min/max spreads are tight (±1–2%).
- In-process static/params improved dramatically on the dirty tree while
  `inject`-vs-socket fuzz parity holds at 0 mismatches — the fast path does
  not change observable responses on the fuzzed route mix.
- Bun public-listener parity is inside `±2%` for this single run; the
  3-consecutive-seed gate is still the requirement to lift
  `no-performance-claim`.
- Do not subtract these `5s × 3` numbers from the historical `30s × 7`
  release-gate tables (different sustained-load behavior), and do not mix
  `listen` vs `handler` entrypoint tiers.
