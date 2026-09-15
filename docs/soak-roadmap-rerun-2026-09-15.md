# Soak Evidence — 1M and 10M Requests — 2026-09-15

These are fresh request-count gates run for the v1.0 release candidate after the
current roadmap changes.
They are not the deferred 24-hour production-readiness soak.

## Commands

```bash
npm run soak:1m
npm run soak:10m
```

The runner alternates a static `/health` route and a dynamic `/u199/:id` route.
The static app keeps the default request-id behavior enabled; the dynamic app
uses `requestId: false` to keep the mixed route workload deterministic. Each
run records failures, runtime errors, process exit, heap/RSS deltas and periodic
memory samples.

## Environment

| Field | Value |
|---|---|
| Node | `v26.8.2` |
| OS/kernel | `linux 6.18.50-2-cachyos-lts` |
| CPU | `AMD Ryzen 5 5600 6-Core Processor` |
| CPU threads | `12` |
| system memory | `23.39 GiB` |
| date | `2026-09-15` Asia/Bangkok |

## Gate results

| Gate | Requests | Failures | Runtime errors | Elapsed | Throughput | Heap delta | RSS delta | Process exit |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1M | 1,000,000 | 0 | 0 | 3,519.33 ms | 284,145 req/s | +11.54 MiB | +32.13 MiB | success |
| 10M | 10,000,000 | 0 | 0 | 37,875.84 ms | 264,021 req/s | +21.98 MiB | +82.03 MiB | success |

## Memory observations

The 1M run sampled RSS around `120 MiB` at 100k requests, `128 MiB` at 500k,
and `128 MiB` at 1M. The 10M run sampled approximately `121 MiB` at 100k,
`145 MiB` at 2.4M, `177 MiB` at 8.3M, and `177 MiB` at 10M. Heap usage varied
with garbage collection rather than growing monotonically.

The RSS steps are reported separately as allocator/runtime retention. They are
not an automatic failure because the final interval plateaued, but longer
production-like observation is still required for a leak conclusion. The
24-hour soak remains deferred by decision and production readiness is not
declared by these short request-count gates alone.
