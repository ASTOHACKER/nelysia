# Short Performance Evidence — 2026-09-15

This is the roadmap short regression matrix. It is intentionally separate from
the historical oha reports and does not combine numbers from another harness.

## Reproduction

```bash
npm run benchmark:short
```

Settings: warmup `2.5s`, measured duration `5s` per sample, `3` samples per
workload, concurrency `50`, route counts `1/10/100/500`. The runner exercises
static, params, query, body, deterministic schema, JWT, hooks and combined
workloads. Failures are counted per sample; heap and RSS are sampled before and
after each measured sample.

For a release comparison, pass a prior report (or a JSON array containing
`routeCount`, `workload`, and `medianRps`) with
`VERIFY_BASELINE=/path/to/baseline.json npm run benchmark:short`. A drop of at
most `2%` is `pass`, `2–5%` is `investigate`, and more than `5%` blocks the gate.
Without `VERIFY_BASELINE`, the command reports measurements and failures but
does not invent a comparison baseline.

## Environment

| Field | Value |
|---|---|
| Node | `v26.8.2` |
| runtime | Node |
| OS/kernel | `linux 6.18.50-2-cachyos-lts` |
| CPU | `AMD Ryzen 5 5600 6-Core Processor` |
| CPU threads | `12` |
| system memory | `23.39 GiB` |
| generated at | `2026-09-15 12:31:21 Asia/Bangkok` |

## Results

All `32` workload/configuration combinations completed with `0` failures. RPS
is the median of the three measured samples; latency is the p95/p99 from the
bounded latency sample collected by the runner.

| Routes | Workload | Median req/s | Min | Max | p95 ms | p99 ms | Failures |
|---:|---|---:|---:|---:|---:|---:|---:|
| 1 | static | 488,020 | 480,200 | 489,010 | 0.179 | 0.288 | 0 |
| 1 | params | 411,040 | 403,590 | 413,830 | 0.193 | 0.324 | 0 |
| 1 | query | 436,642 | 431,030 | 440,720 | 0.231 | 0.407 | 0 |
| 1 | body | 456,520 | 453,010 | 479,420 | 0.261 | 0.443 | 0 |
| 1 | schema | 311,800 | 311,320 | 314,930 | 0.311 | 0.453 | 0 |
| 1 | jwt | 43,275 | 42,633 | 43,496 | 2.414 | 3.196 | 0 |
| 1 | hooks | 437,170 | 432,280 | 443,790 | 0.223 | 0.370 | 0 |
| 1 | combined | 36,765 | 36,082 | 37,120 | 2.990 | 3.702 | 0 |
| 10 | static | 449,310 | 429,770 | 453,550 | 0.189 | 0.311 | 0 |
| 10 | params | 383,340 | 374,290 | 385,790 | 0.227 | 0.500 | 0 |
| 10 | query | 404,170 | 398,590 | 406,600 | 0.245 | 0.384 | 0 |
| 10 | body | 443,330 | 441,300 | 454,620 | 0.190 | 0.513 | 0 |
| 10 | schema | 306,980 | 300,360 | 307,420 | 0.288 | 0.534 | 0 |
| 10 | jwt | 42,469 | 42,070 | 42,668 | 2.492 | 3.800 | 0 |
| 10 | hooks | 441,260 | 439,930 | 448,230 | 0.233 | 0.291 | 0 |
| 10 | combined | 36,288 | 35,403 | 36,373 | 2.851 | 3.783 | 0 |
| 100 | static | 445,620 | 438,742 | 466,890 | 0.234 | 0.358 | 0 |
| 100 | params | 364,540 | 340,350 | 374,965 | 0.264 | 0.348 | 0 |
| 100 | query | 396,880 | 395,300 | 407,520 | 0.243 | 0.431 | 0 |
| 100 | body | 451,950 | 450,140 | 464,600 | 0.233 | 0.402 | 0 |
| 100 | schema | 299,460 | 296,010 | 302,590 | 0.320 | 0.378 | 0 |
| 100 | jwt | 40,194 | 38,419 | 40,920 | 2.348 | 3.921 | 0 |
| 100 | hooks | 414,660 | 409,700 | 417,180 | 0.261 | 0.447 | 0 |
| 100 | combined | 33,625 | 32,823 | 33,833 | 2.702 | 4.114 | 0 |
| 500 | static | 459,840 | 452,590 | 461,370 | 0.233 | 0.311 | 0 |
| 500 | params | 391,280 | 381,530 | 393,460 | 0.213 | 0.353 | 0 |
| 500 | query | 416,630 | 415,995 | 419,180 | 0.221 | 0.318 | 0 |
| 500 | body | 471,210 | 448,610 | 473,140 | 0.243 | 0.333 | 0 |
| 500 | schema | 306,620 | 305,620 | 311,580 | 0.258 | 0.348 | 0 |
| 500 | jwt | 40,946 | 40,782 | 41,158 | 2.409 | 4.613 | 0 |
| 500 | hooks | 461,840 | 458,840 | 461,940 | 0.223 | 0.277 | 0 |
| 500 | combined | 34,511 | 34,300 | 34,578 | 2.690 | 4.359 | 0 |

The raw runner also captured heap/RSS before and after every sample. RSS ranged
from about `166 MiB` at the first sample to `207 MiB` at the highest observed
sample, with no functional failures. These are local observations, not a leak
claim or a cross-hardware performance promise. The separate
[runtime contract report](./benchmark-runtime-contract-2026-09-15.md) covers
fuzz parity and the real `listen(0) → fetch()` entrypoint.
