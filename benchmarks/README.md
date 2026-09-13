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
BENCH_DURATION_SEC=10 BENCH_CONCURRENCY=50 BENCH_ROUNDS=3 npm run benchmark:oha
```

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
