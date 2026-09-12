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

This is a smoke benchmark, not a framework claim. Record Node version, CPU, OS, dependency versions, and whether other workloads are running before comparing results. Use a dedicated load generator and multiple repetitions before publishing numbers.
