# SvelteKit Fetch Contract

`src/routes/api/nelysia/+server.ts` shows the endpoint method boundary:

```ts
export const GET = ({ request }) => fetchHandler(request)
```

This is a source example, not a complete SvelteKit integration. It does not
include a SvelteKit project, `@sveltejs/kit` dependency, adapter configuration,
hooks, SSR pages, or a deployment target. The handler only promises the Web
Fetch `Request`/`Response` contract; cookies through SvelteKit event helpers,
streaming policy, platform bindings, and WebSocket upgrades are not covered.
Run the repository's deterministic contract test with `npm test`.
