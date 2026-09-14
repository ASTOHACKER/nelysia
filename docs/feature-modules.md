# Feature Modules

Nelysia uses a feature-based structure. A feature is a self-contained `Nelysia` instance that owns its routes, schemas, hooks, and dependencies.

```text
src/
  app.ts
  modules/
    users/
      index.ts
      model.ts
      service.ts
      repository.ts
      test.ts
  plugins/
  shared/
```

## Module As Controller

Use the Nelysia instance as the controller. This keeps the route handler context inferred by the application instead of forcing a controller class to accept the entire `Context` object.

```ts
// modules/users/index.ts
import { Nelysia, t } from "@narudom96/nelysia"
import { UserService } from "./service"

const UserModel = {
  create: t.Object({ name: t.String() }),
  output: t.Object({ id: t.String(), name: t.String() })
}

export const users = new Nelysia({
  name: "users",
  prefix: "/users"
})
  .model(UserModel)
  .post("/", ({ body }) => UserService.create(body), {
    body: "create",
    response: "output"
  })
```

## Service Boundary

Services contain business logic and receive only the values they need. They should not depend on Nelysia's `Context`.

```ts
// modules/users/service.ts
export const UserService = {
  create(input: { name: string }) {
    return { id: crypto.randomUUID(), name: input.name }
  }
}
```

## Composition

The root application explicitly composes feature modules and infrastructure dependencies.

```ts
import { Nelysia } from "@narudom96/nelysia"
import { users } from "./modules/users"
import { database } from "./plugins/database"

export const app = new Nelysia()
  .use(database)
  .use(users)
```

`.use()` accepts a feature instance, a synchronous plugin, or an async/lazy module. Named instances are deduplicated by `name` and `seed`.

```ts
export const app = new Nelysia()
  .use(import("./modules/admin"))

await app.modules
```

`listen()` also awaits pending lazy modules before binding a server. If a lazy module rejects, startup rejects and no server is created.

## Models

Use named schemas as the single source of truth for validation, inferred values, and OpenAPI generation.

```ts
const api = new Nelysia()
  .model({
    User: t.Object({ name: t.String() })
  })
  .post("/users", ({ body }) => body, {
    body: "User",
    response: "User"
  })
```

## Context Extensions

Use `state` for application values, `decorate` for reusable helpers, and `derive` or `resolve` for request-dependent values.

```ts
const auth = new Nelysia({ name: "auth" })
  .resolve(async ({ headers }) => ({
    user: await loadUser(headers.get("authorization"))
  }))
```

Do not pass the whole request context to a service. Destructure the required value in the route handler.

## Guard and Macro

Use `guard` for a shared schema and hook boundary, and `macro` for reusable route policies.

```ts
const app = new Nelysia()
  .macro({
    authenticated: {
      beforeHandle: verifyAuth
    }
  })
  .get("/profile", getProfile, { authenticated: true })
```

## Testing

Test modules without binding a port:

```ts
const response = await users.inject({
  method: "POST",
  path: "/",
  body: { name: "Ada" }
})
```

Every module should have tests for its route contract, validation failures, dependencies, and lifecycle boundaries.

For a new module scaffold, run:

```bash
nelysia generate feature users --dir src/modules
```
