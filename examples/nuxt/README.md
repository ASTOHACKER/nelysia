# Nuxt Fetch Contract

`server/api/nelysia.ts` exports the Fetch handler that a Nuxt/Nitro bridge can
call:

```ts
export const fetchHandler = createFetchHandler(app)
```

This is intentionally not a drop-in Nuxt server route. It does not include a
Nuxt project, `nuxt` or `h3` dependency, `defineEventHandler` bridge, Nitro
configuration, or a deployment target. The handler only promises the Web Fetch
`Request`/`Response` contract; event conversion, Nuxt rendering, platform
bindings, and WebSocket upgrades are not covered. Run the repository's
deterministic contract test with `npm test`.
