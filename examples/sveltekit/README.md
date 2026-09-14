# SvelteKit API Integration

`src/routes/api/nelysia/+server.ts` is a SvelteKit server route that forwards
the framework `RequestEvent`:

```ts
export const GET = ({ request }) => fetchHandler(request)
```

This directory includes a runnable `package.json` fixture with SvelteKit and
the local Nelysia package. Run `npm install && npm run dev` here. Cookies,
streaming policy, and deployment bindings remain application-specific.
