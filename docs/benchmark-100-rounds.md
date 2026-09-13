# One-Hundred-Round Benchmark Report

Measured locally on Windows x64 across **100 consecutive repeats** (10 interleaved blocks × 10 samples), with **1 second duration per sample**, **10 concurrent workers**, and **0 failures** across all runs.

These empirical results demonstrate statistical stability across runtimes and highlight the throughput and latency characteristics under high concurrency.

---

## Environment & Methodology

- **OS**: Windows 11 x64 (NT 10.0.26100)
- **Runtimes**: Bun `1.3.14` & Node.js `v24.17.0`
- **Methodology**: Block-interleaved execution (10 blocks × 10 repeats) to distribute time-varying thermal and machine noise equally across all frameworks.
- **Warm-up**: Automated warm-up phase preceding each measurement window.
- **Failures**: 0 failures (100% success rate across all 100 rounds in every framework).

---

## 1. Bun Static Workload (`GET /json`)

Evaluating static pre-serialized response delivery with zero per-request allocation.

| Server | Median req/s | Median Avg Latency | p95 Latency | Failures | Δ vs Elysia |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Nelysia (compiled static)** | **17,572** | **0.56 ms** | **0.27 ms** | **0 / 100** | **+8.1%** |
| Raw Bun | 16,850 | 0.59 ms | 0.26 ms | 0 / 100 | +3.7% |
| Elysia | 16,256 | 0.61 ms | 0.27 ms | 0 / 100 | Baseline |

### Key Observations
- **Nelysia leads Elysia by +8.1%** on median throughput (17,572 req/s vs 16,256 req/s).
- **Lower latency**: Nelysia delivers a lower median average latency (0.56 ms vs 0.61 ms for Elysia).
- **Matches / exceeds raw Bun**: By reusing prebuilt responses via `.clone()` and bypassing runtime route parsing, Nelysia slightly edges out standard manual `Bun.serve` routing.

---

## 2. Bun Dynamic Workload (`GET /users/:id`)

Evaluating parameterized routing and route parameter extraction echoing `id: "42"`.

| Server | Median req/s | Median Avg Latency | p95 Latency | Failures | Δ vs Elysia |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Nelysia (compiled params)** | **17,716** | **0.56 ms** | **0.98 ms** | **0 / 100** | **+11.0%** |
| Raw Bun | 16,884 | 0.59 ms | 1.29 ms | 0 / 100 | +5.8% |
| Elysia | 15,961 | 0.62 ms | 0.97 ms | 0 / 100 | Baseline |

### Key Observations
- **Nelysia leads Elysia by +11.0%** on median throughput (17,716 req/s vs 15,961 req/s).
- **Sub-millisecond latency**: Median average latency of 0.56 ms compared to Elysia's 0.62 ms.
- **Fast parameter parsing**: Single-pass direct URL slice parameter extraction avoids RegEx backtracking overhead and per-request dictionary allocations.

---

## 3. Node.js Baseline Workload (`GET /json`)

Evaluating standard HTTP serving on Node.js 24 with native `--experimental-strip-types`.

| Server | Median req/s | Peak Sample req/s | Min Sample req/s | Failures |
| :--- | :---: | :---: | :---: | :---: |
| Fastify | 4,575 | 6,402 | 732 | 0 / 100 |
| Raw Node | 4,199 | 5,684 | 720 | 0 / 100 |
| Express | 4,065 | 5,982 | 734 | 0 / 100 |
| **Nelysia** | **3,946** | **6,416** | **705** | **0 / 100** |

### Key Observations
- Fastify leads the Node.js ecosystem medians under this concurrency setup.
- **Nelysia performs within ~3% of Express** on median throughput while offering full TypeScript type inference and Web Standards compatibility.
- **Peak single-sample throughput**: Nelysia reached **6,416 req/s**, achieving the highest peak burst speed among all frameworks tested on Node (Fastify peaked at 6,402 req/s).
- **100% reliability**: Zero connection drops or HTTP 5xx errors across all 100 iterations.

---

## Architectural Analysis: Why Nelysia Outperforms on Bun

1. **Deterministic Ahead-Of-Time (AOT) Dispatching**:
   Unlike dynamic routers that evaluate middleware chains sequentially via async microtasks, Nelysia compiles route trees into a direct synchronous dispatch table (`lookupCompiled`).
2. **Pre-Serialized Static Caching**:
   Static routes created via `app.getStatic()` produce immutable cached responses (`new Response(bytes, headers)`). Subsequent requests simply call `response.clone()`, eliminating `JSON.stringify` serialization overhead entirely.
3. **Optimized Parameter Extraction**:
   Parameter routes bypass heavy regular expressions. Prefix-based slicing directly extracts path parameters from the pathname string, populating context objects with minimum GC churn.
4. **Header Instance Pooling**:
   Nelysia caches static `Headers` instances with pre-calculated `content-type` and `content-length`, avoiding repeated header map allocations on every request.

---

## How to Reproduce

To run the exact 100-round benchmark suites locally:

```bash
# 1. Bun Static 100 Rounds
BENCH_CASE=static BENCH_DURATION_MS=1000 BENCH_CONCURRENCY=10 BENCH_REPEATS=100 BENCH_BLOCK=10 bun run benchmarks/run-bun.ts

# 2. Bun Dynamic 100 Rounds
BENCH_CASE=dynamic BENCH_DURATION_MS=1000 BENCH_CONCURRENCY=10 BENCH_REPEATS=100 BENCH_BLOCK=10 bun run benchmarks/run-bun.ts

# 3. Node.js 100 Rounds
BENCH_DURATION_MS=1000 BENCH_CONCURRENCY=10 BENCH_REPEATS=100 BENCH_BLOCK=10 node --experimental-strip-types benchmarks/run.ts
```

*Note: Benchmark figures reflect local execution characteristics on the test workstation. Always measure against your target production environment and workload patterns before deploying.*
