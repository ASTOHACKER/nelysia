# Preliminary Benchmark

Run from the repository root:

```bash
npm run benchmark
```

The same process, route, response, host, concurrency, and duration are used for every adapter:

- raw Node HTTP
- Nelysia Node adapter
- Fastify
- Express

Defaults are 20 concurrent workers for 5 seconds and 3 measurement rounds. Reports use median throughput and latency across rounds, plus p95 request latency. Override them for local experiments:

```bash
BENCH_DURATION_MS=10000 BENCH_CONCURRENCY=50 BENCH_REPEATS=5 npm run benchmark
```

Bun target benchmark:

```bash
npm run benchmark:bun
```

Dynamic parameter workload:

```bash
BENCH_CASE=dynamic BENCH_DURATION_MS=10000 BENCH_CONCURRENCY=20 npm run benchmark:bun
```

This compares a raw `Bun.serve()` handler, Nelysia's explicit `getStatic()` compiled path, and `elysia@2.0.0-exp.60` under the same workload. The Nelysia static path is intentionally reported by name and must not be confused with the generic `.get()` path.

## High-Performance Benchmarks with `oha`

Dedicated load-generator benchmarking using [`oha`](https://github.com/hatoo/oha):

The latest recorded run is documented in [`docs/benchmark-oha-2026-09-14.md`](../docs/benchmark-oha-2026-09-14.md).

The latest run uses `oha 1.16.0`, 50 concurrent workers, 3 seconds per sample,
10 rounds, and zero failed requests. It reports separate JSON/static and dynamic
parameter workloads for Node and Bun, including Raw Node, Raw Bun, Elysia,
Fastify, and Express baselines where applicable. For a same-runner trend check
against the older ten-round report, see the comparison table in the latest
report; do not subtract results across different runners or workload settings.

```bash
# Run full suite (Bun + Node)
npm run benchmark:oha

# Run Bun suite only
npm run benchmark:oha:bun

# Run Node suite only
npm run benchmark:oha:node

# Run JWT suite
npm run benchmark:jwt

# Run TechEmpower suite
npm run benchmark:teb
```

Environment variables to customize:

```bash
BENCH_DURATION_SEC=3 BENCH_CONCURRENCY=50 BENCH_ROUNDS=10 BENCH_PORT=4341 npm run benchmark:oha

# Use another base port when the default 4321 is already occupied.
BENCH_PORT=4331 npm run benchmark:oha

# Bun route-compiled patch evidence (30 seconds × 7, concurrency 50)
BENCH_ROUTE_SET=single npm run benchmark:oha:route:release
BENCH_ROUTE_SET=multi npm run benchmark:oha:route:release
```

`BENCH_DURATION_SEC` controls each measured sample, `BENCH_CONCURRENCY` sets
the number of `oha` workers, `BENCH_ROUNDS` controls the median sample count,
and `BENCH_PORT` changes the base port used by the temporary benchmark servers.
The runner records failures and refuses to present a successful-looking result
when a request fails. Install `oha` separately and ensure it is on `PATH` before
running these commands.

The route patch runner is a Bun-only, same-runner comparison with warmup excluded,
30 seconds per sample, 7 samples, concurrency 50, and environment metadata. It
reports three matched tiers: `getStatic` `static-prebuilt`, zero-argument `.get()`
`static-sync`, and params-only dynamic. `BENCH_ROUTE_SET=single` uses one route;
`BENCH_ROUTE_SET=multi` adds a non-target route so dispatcher lookup is exercised.
The zero-argument tier is compared with the standard Bun adapter in the same
fixture. A result below the 10% median improvement threshold is recorded as
correctness-only with no performance claim; historical benchmark numbers are not
combined with this report.

Router scale benchmark (generic path, single `app.handle()` lookup cost as the table grows):

```bash
node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=100 node --experimental-strip-types benchmarks/router-scale.ts
ROUTES=1000 N=100000 node --experimental-strip-types benchmarks/router-scale.ts
```

Fairness note: the Node baseline app uses `new Nelysia({ requestId: false })` so the
comparison measures routing/serialization like raw/fastify/express, which do not
generate a request ID per request. The default (`requestId: true`) preserves the
`x-request-id` echo contract and costs one UUID per request in the Node/Bun adapters.

This is a smoke benchmark, not a framework claim. Record Node version, CPU, OS, dependency versions, and whether other workloads are running before comparing results. Use a dedicated load generator and multiple repetitions before publishing numbers.

The release suite also includes a 200-request concurrent isolation test and a
request-ID enabled/disabled contract test in `tests/stability.test.ts`. These
are correctness guards; benchmark throughput is not used as proof of
correctness.
