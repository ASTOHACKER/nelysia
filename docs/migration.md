# Migration Guides

## From Express

```ts
// Express
app.get("/users/:id", (request, response) => response.json({ id: request.params.id }))

// Nelysia
const app = new Nelysia().get("/users/:id", ({ params }) => ({ id: params.id }))
```

Nelysia handlers return values instead of calling `response.json`. Use `context.response(status, body)` for explicit status and headers.

## From Fastify

```ts
const app = new Nelysia()
  .post("/users", ({ body }) => body, { body: t.Object({ name: t.String() }) })
```

Fastify schemas map to Nelysia route options. Validation runs before the handler and the same schema metadata feeds OpenAPI.

## From Elysia

```ts
const app = new Nelysia()
  .get("/health", () => ({ ok: true }))
  .use(openapi())
```

The routing and lifecycle concepts are intentionally familiar. Check the compatibility matrix before relying on runtime-specific features such as WebSocket APIs or platform bindings.

## Compatibility Rule

Migration examples describe the supported Nelysia contract. They do not promise that framework-specific middleware, decorators, or plugins can be copied without adaptation.
