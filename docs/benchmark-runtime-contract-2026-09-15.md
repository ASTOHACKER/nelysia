# Runtime Contract Evidence — 2026-09-15

This is the short runtime contract gate for the v1.0 release. It
checks both request entrypoints used by the package: `app.inject()` and a real
Node server started with `listen(0)` and exercised through `fetch()`.

It is functional and allocation evidence, not a long-duration production claim.
The 24-hour soak remains deferred by decision.

## Command

```bash
npm run benchmark:runtime
```

The default gate runs 1,000 fuzz cases and sequential 10k, 50k and 100k request
bursts. Use `RUNTIME_FUZZ_CASES` and `RUNTIME_BURSTS` only for local iteration;
release evidence should keep the defaults or record any override.

## Environment

| Field | Value |
|---|---|
| Node | `v26.8.2` |
| OS/kernel | `linux 6.18.50-2-cachyos-lts` |
| CPU | `AMD Ryzen 5 5600 6-Core Processor` |
| CPU threads | `12` |
| system memory | `23.39 GiB` |
| request-id policy | disabled for deterministic response comparison |
| generated at | `2026-09-15 12:31:21 Asia/Bangkok` |

## Result

| Check | Result |
|---|---:|
| fuzz cases | `1,000` |
| fuzz failures | `0` |
| status mismatches | `0` |
| fuzz route mix | `334 static / 334 dynamic / 332 404` |
| `app.inject()` baseline | `1.22 ms` |
| Node `listen(0) → fetch()` fuzz | `345.34 ms` |
| runtime errors | `0` |
| process exit | `success` |

### Memory burst

| Requests | Failures | Elapsed | Throughput | Heap before → after | RSS before → after |
|---:|---:|---:|---:|---:|---:|
| 10,000 | 0 | 47.34 ms | 211,252 req/s | 32,314 → 34,326 KiB | 169,712 → 180,464 KiB |
| 50,000 | 0 | 153.97 ms | 324,739 req/s | 34,329 → 33,191 KiB | 180,464 → 177,256 KiB |
| 100,000 | 0 | 296.86 ms | 336,864 req/s | 33,191 → 31,902 KiB | 177,256 → 212,072 KiB |

The burst alternates `/static` and `/users/:id`. Heap and RSS are reported as
observations only; allocator/runtime retention is not treated as a leak without
a continuing-growth trend. The gate passed with zero functional failures,
zero status mismatches, zero runtime errors and a successful process exit.
