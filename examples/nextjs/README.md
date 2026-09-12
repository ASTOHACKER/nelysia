# Next.js Fetch Contract

`app/api/nelysia/route.ts` shows the App Router method contract:

```ts
export const GET = createFetchHandler(app)
```

This is a source example, not a complete Next.js integration. It does not
include a Next.js project, `next` dependency, route configuration, middleware,
React Server Components, or a deployment target. The handler only promises the
Web Fetch `Request`/`Response` contract; Edge/Node runtime selection, caching,
streaming policy, and WebSocket upgrades are not covered. Run the repository's
deterministic contract test with `npm test`.
