# TanStack Start API Integration

`src/routes/api/nelysia.ts` exports a TanStack Start `Route` with native server
handlers:

```ts
export const Route = createFileRoute('/api/nelysia')({
  server: { handlers: { GET: ({ request }) => fetchHandler(request) } }
})
```

This directory includes a runnable `package.json` fixture with TanStack Start,
React, and the local Nelysia package. Run `npm install && npm run dev` here.
Router middleware, SSR, and deployment bindings remain application-specific.
