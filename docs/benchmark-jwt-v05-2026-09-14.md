# Nelysia v0.5 JWT Release Benchmark Evidence — 2026-09-14

This report records the v0.5 JWT public/protected security benchmark. It uses
one runner, one host, a separate warmup before every measured sample, 30
seconds per measured sample, 7 measured samples, and concurrency 50. The
benchmark compares the same five request scenarios across Nelysia, Hono, and
Elysia; it does not combine results from other runners or workloads.

## Environment and method

| Item | Value |
| --- | --- |
| Command | `npm run benchmark:jwt:release` |
| Runtime | Bun 1.4.0 |
| HTTP load tool | oha 1.16.0 |
| Host CPU | AMD Ryzen 5 5600, 6 cores / 12 threads |
| OS | Linux 6.18.50-2-cachyos-lts x86_64 |
| Node.js | v26.8.2 |
| Concurrency | 50 |
| Measured samples | 30s × 7 per framework/scenario |
| Warmup | 1s before every measured sample, excluded |
| Scenarios | no auth, valid, missing, invalid, expired JWT |

The expected HTTP statuses are `200` for the public and valid-token scenarios,
and `401` for missing, invalid, and expired tokens. A failure is either a
non-successful load-tool request or a response with a status different from
the scenario's expected status.

## Results

### No auth — `GET /public` — expected `200`

| Framework | Median req/s | Min/Max req/s | Avg latency | p50 | p95 | p99 | Status | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Nelysia (`@nelysia/jwt`) | **93,392** | 91,014 / 97,422 | 0.53 ms | 0.49 ms | 0.84 ms | 1.17 ms | 200 | 0 |
| Hono (`hono/jwt`) | 79,230 | 69,839 / 83,075 | 0.63 ms | 0.53 ms | 1.14 ms | 1.75 ms | 200 | 0 |
| Elysia (WebCrypto JWT) | 84,620 | 80,957 / 91,478 | 0.59 ms | 0.52 ms | 1.05 ms | 1.64 ms | 200 | 0 |

### Valid JWT — `GET /profile` — expected `200`

| Framework | Median req/s | Min/Max req/s | Avg latency | p50 | p95 | p99 | Status | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Nelysia (`@nelysia/jwt`) | 28,011 | 27,075 / 28,981 | 1.78 ms | 1.64 ms | 2.79 ms | 3.83 ms | 200 | 0 |
| Hono (`hono/jwt`) | 27,868 | 25,753 / 29,811 | 1.79 ms | 1.56 ms | 3.18 ms | 4.45 ms | 200 | 0 |
| Elysia (WebCrypto JWT) | **35,044** | 34,485 / 35,891 | 1.43 ms | 1.29 ms | 2.41 ms | 3.30 ms | 200 | 0 |

### Missing JWT — `GET /profile` — expected `401`

| Framework | Median req/s | Min/Max req/s | Avg latency | p50 | p95 | p99 | Status | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Nelysia (`@narudom96/nelysia/jwt`) | **55,524** | 54,232 / 56,585 | 0.90 ms | 0.82 ms | 1.39 ms | 1.98 ms | 401 | 0 |
| Hono (`hono/jwt`) | 32,932 | 32,264 / 34,347 | 1.52 ms | 1.38 ms | 2.41 ms | 3.29 ms | 401 | 0 |
| Elysia (WebCrypto JWT) | 57,657 | 54,721 / 59,834 | 0.87 ms | 0.77 ms | 1.49 ms | 2.22 ms | 401 | 0 |

### Invalid JWT — `GET /profile` — expected `401`

| Framework | Median req/s | Min/Max req/s | Avg latency | p50 | p95 | p99 | Status | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Nelysia (`@narudom96/nelysia/jwt`) | 38,340 | 35,815 / 39,924 | 1.30 ms | 1.19 ms | 2.19 ms | 2.81 ms | 401 | 0 |
| Hono (`hono/jwt`) | 19,309 | 18,574 / 20,984 | 2.58 ms | 2.37 ms | 4.13 ms | 5.54 ms | 401 | 0 |
| Elysia (WebCrypto JWT) | **39,681** | 37,971 / 40,373 | 1.26 ms | 1.10 ms | 2.24 ms | 3.25 ms | 401 | 0 |

### Expired JWT — `GET /profile` — expected `401`

| Framework | Median req/s | Min/Max req/s | Avg latency | p50 | p95 | p99 | Status | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Nelysia (`@narudom96/nelysia/jwt`) | 32,411 | 29,947 / 33,102 | 1.54 ms | 1.40 ms | 2.46 ms | 3.37 ms | 401 | 0 |
| Hono (`hono/jwt`) | 20,086 | 19,673 / 20,793 | 2.49 ms | 2.29 ms | 3.76 ms | 5.24 ms | 401 | 0 |
| Elysia (WebCrypto JWT) | **35,500** | 32,802 / 39,493 | 1.41 ms | 1.28 ms | 2.34 ms | 3.15 ms | 401 | 0 |

## Gate result

- 105 measured samples completed: 3 frameworks × 5 scenarios × 7 rounds.
- All expected statuses were returned; total failures were **0**.
- Public JWT route median: Nelysia **93,392 req/s**.
- Valid JWT verification median: Nelysia **28,011 req/s**.
- Missing, invalid, and expired tokens all returned `401` with zero failures.
- This closes the v0.5 JWT benchmark evidence gate (P5/P4 evidence).

The numbers are same-runner evidence for this fixture and hardware. They are
not a universal speed claim against Raw Bun, Hono, or Elysia, and they do not
close the separate 24-hour soak or production-readiness gate.

Re-run with:

```bash
npm run benchmark:jwt:release
```
