# Cloudflare Workers Fetch Example

`worker.ts` exports the `{ fetch(request, env, ctx) }` contract through
`createCloudflareWorker`. The adapter forwards `env` and the execution context
to the Nelysia route context, while keeping server binding and Node APIs out of
the worker entrypoint.

The local contract smoke test is part of `npm test`; deployment compatibility
depends on the Web APIs and bindings provided by the selected Workers runtime.

Deploy (requires `wrangler` and a `wrangler.toml` in your own project — this
folder ships no Workers config on purpose):

```bash
npx wrangler deploy
```
