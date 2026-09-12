# Platform Examples

## Deno

`examples/deno/main.ts` uses `Deno.serve` and the Fetch-standard adapter:

```bash
deno run --allow-net examples/deno/main.ts
```

The checked contract is also available with `npm run deno:check`.

## Cloudflare Workers

`examples/cloudflare/worker.ts` exports the Workers `fetch` object contract. The adapter uses only Web APIs and does not require Node globals.

## Current Limits

These examples cover HTTP `Request`/`Response` behavior. WebSocket upgrades, platform bindings, deployment configuration, and platform-specific observability still require separate integration tests before the v0.4 runtime gates can be marked complete.
