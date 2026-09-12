# TanStack Start Fetch Contract

`src/routes/api/nelysia.ts` exports the Fetch boundary for a TanStack Start
server route:

```ts
export const fetchHandler = createFetchHandler(app)
```

This is intentionally not a drop-in TanStack Start route. It does not include
TanStack Start, TanStack Router, or a router/deployment dependency, nor does it
call `createFileRoute` or configure a server function. The handler only promises
the Web Fetch `Request`/`Response` contract; router context, middleware,
streaming policy, SSR, platform bindings, and WebSocket upgrades are not
covered. Run the repository's deterministic contract test with `npm test`.
