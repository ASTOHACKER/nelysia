# Nuxt/Nitro API Integration

`server/api/nelysia.ts` is a Nitro server route. It wraps Nelysia with
`defineEventHandler` and forwards H3's Web-standard request:

```ts
export default defineEventHandler((event) => fetchHandler(toWebRequest(event)))
```

This directory includes a runnable `package.json` fixture with Nuxt and the
local Nelysia package. Run `npm install && npm run dev` here. Nitro rendering,
platform bindings, and WebSocket upgrades remain application-specific.
