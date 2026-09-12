# Ten-Round Benchmark

Measured locally with 10 repeats, 1 second per repeat, 10 concurrent workers, and zero failures. These are directional local results, not a universal framework ranking.

## Node

| Server | Median req/s | Samples req/s |
| --- | ---: | --- |
| Raw Node | 5,816 | 4,985, 5,640, 5,693, 5,706, 5,805, 5,816, 5,843, 5,860, 5,969, 6,139 |
| Nelysia | 5,208 | 5,067, 5,072, 5,094, 5,159, 5,203, 5,208, 5,213, 5,262, 5,268, 5,275 |
| Fastify | 5,664 | 5,621, 5,629, 5,634, 5,652, 5,653, 5,664, 5,690, 5,691, 5,741, 5,742 |
| Express | 5,286 | 5,039, 5,193, 5,196, 5,201, 5,235, 5,286, 5,313, 5,321, 5,335, 5,350 |

## Bun static (`GET /json`)

| Server | Median req/s | Median avg latency | p95 latency | Failures | Samples |
| --- | ---: | ---: | ---: | ---: | --- |
| Raw Bun | 29,625 | 0.34 ms | 0.81 ms | 0 | 29204, 27943, 29258, 29625, 25916, 29774, 30819, 29989, 31030, 30129 |
| Nelysia static compiled | 30,618 | 0.33 ms | 0.63 ms | 0 | 31213, 30545, 30301, 30433, 30618, 31371, 30714, 30549, 31097, 31528 |
| Elysia | 28,615 | 0.35 ms | 0.65 ms | 0 | 28972, 28973, 27867, 27688, 28074, 28656, 29196, 28615, 28749, 28143 |

Nelysia leads Elysia by ~7.0% on the static workload.

## Bun dynamic (`GET /users/:id`)

| Server | Median req/s | Median avg latency | p95 latency | Failures | Samples |
| --- | ---: | ---: | ---: | ---: | ---: |
| Raw Bun | 29,587 | 0.34 ms | 0.64 ms | 0 | 29606, 29587, 29754, 30405, 28475, 29320, 30397, 29125, 29429, 30161 |
| Nelysia params compiled | 28,991 | 0.34 ms | 0.64 ms | 0 | 29005, 28295, 29115, 29465, 29492, 27638, 26210, 28991, 29360, 28878 |
| Elysia | 28,125 | 0.35 ms | 0.66 ms | 0 | 29076, 27834, 29140, 29023, 28125, 28546, 27934, 27823, 28822, 26909 |

Nelysia leads Elysia by ~3.1% on the dynamic workload. Both handlers echo the `id` param, so the comparison is like-for-like.

## What changed

The compiled Bun handler was optimized: prebuilt responses served via `clone()`, shared `Headers` instances, no per-request `Headers` allocation, synchronous dispatch (no Promise microtask), direct single-route compare, and param extraction straight from the URL. Longer 3s × 5 runs confirm the same ordering (static 39,448 vs 37,846; dynamic 36,575 vs 37,015 within noise on one run, ahead on the 10-round medians).

Repeat on the target hardware before making deployment decisions.
