# Compatibility Matrix

This matrix records verified behavior in the current workspace. It is intentionally narrower than a promise of support for every version of a runtime.

| Capability | Node 26.8.1 | Bun 1.4.0 |
| --- | --- | --- |
| HTTP routing | verified | verified |
| JSON body parsing | verified | verified |
| Validation and hooks | verified | verified |
| Native Response | verified | verified |
| ReadableStream response | verified | verified |
| WebSocket upgrade | not implemented | verified |
| OpenAPI document | verified | verified |
| Generated build target | verified | verified |
| Request ID propagation | verified | verified |

The Fetch-standard adapter is verified with the Request/Response contract and is suitable as the base for Deno and edge-worker entrypoints. Platform deployment examples remain separate release work.

## Verification Commands

```bash
npm run typecheck
npm test
bun test
npm run soak
npm run release:check
```

The soak runner reports iterations, failures, elapsed time, throughput, and heap delta. Heap delta is a signal for investigation, not a garbage-collection-proof leak measurement.
