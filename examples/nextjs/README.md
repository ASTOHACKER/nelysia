# Next.js App Router Integration

`app/api/nelysia/route.ts` is an App Router route exporting all supported HTTP
methods through the Web-standard handler:

```ts
export const GET = fetchHandler
export const POST = fetchHandler
```

This directory includes a runnable `package.json` fixture with Next.js, React,
and the local Nelysia package. Run `npm install && npm run dev` here. Runtime
selection, caching policy, and WebSocket upgrades remain application-specific.
