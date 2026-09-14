# Roadmap Soak Rerun Evidence — 2026-09-14

This is a fresh regression rerun after the post-v0.5.1 core/compiler and
production-module changes. It covers the requested 1M and 10M gates only. The
24-hour soak was intentionally not run.

## Environment

| Item | Value |
| --- | --- |
| OS/kernel | Linux 6.18.50-2-cachyos-lts x86_64 |
| CPU | AMD Ryzen 5 5600 6-Core Processor |
| CPU topology | 6 cores / 12 threads, 2 threads per core |
| Node.js | v26.8.2 |
| Bun | 1.4.0 |
| Deno | 2.9.6 |
| oha | 1.16.0 |
| Runner | `benchmarks/soak.ts` |
| Route mix | `/health` static request + `/u199/42` params-only request |
| Request-id policy | `/health` enabled; dynamic soak app disabled |

## Results

| Gate | Requests | Failures | Runtime errors | Elapsed | Throughput | Heap delta | RSS delta | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 1M | 1,000,000 | 0 | 0 | 3.546 s | 281,979 req/s | +8.55 MB | +35.09 MB | PASS |
| 10M | 10,000,000 | 0 | 0 | 34.505 s | 289,815 req/s | +10.85 MB | +50.93 MB | PASS |

Memory samples show normal heap reclamation cycles. RSS increased in allocator
steps and then remained flat through later samples; this is reported as a
signal, not treated as an automatic failure without continuous growth.

## Scope and limitations

The runner is an in-process regression/soak harness, not a 24-hour production
deployment test. It does not prove behavior under external network load,
multiple processes, or platform-specific limits. A later 30m/1h/6h sequence is
the evidence ladder before the separately deferred 24-hour gate.
