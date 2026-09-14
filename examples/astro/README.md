# Astro API Integration

`src/pages/api/nelysia.ts` is an Astro API endpoint using the framework's
`APIContext` request:

```ts
export const GET = ({ request }) => fetchHandler(request)
```

This directory includes a runnable `package.json` fixture with Astro and the
local Nelysia package. Run `npm install && npm run dev` here. WebSocket
upgrades and deployment-specific platform bindings remain application-specific.
