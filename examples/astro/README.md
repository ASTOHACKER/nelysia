# Astro Fetch Contract

`src/pages/api/nelysia.ts` shows the smallest Astro endpoint contract:

```ts
export const GET = createFetchHandler(app)
```

This is a source example, not a complete Astro integration. It does not include
an Astro project, `astro` dependency, adapter configuration, SSR pages, or a
deployment target. The handler only promises the Web Fetch `Request`/`Response`
contract; WebSocket upgrades, platform bindings, middleware ordering, and Astro
rendering are not covered. Run the repository's deterministic contract test with
`npm test`.
