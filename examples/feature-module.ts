import { Nelysia, t } from "../packages/core/src/index.ts"

// Feature-module pattern: a module is a Nelysia instance owning its routes,
// schemas and policies. Compose it into your app with `.use()` (as below) or
// `.mount(prefix, app)`, then serve it with `app.listen(port)`.
// NOTE: this file uses a monorepo-relative import and is covered by
// tests/framework-examples.test.ts — consumers should import the package:
// `import { Nelysia, t } from "@narudom96/nelysia"`.

const createUser = t.Object({ name: t.String() })

const users = new Nelysia({ name: "users", prefix: "/users" })
  .model({
    CreateUser: createUser,
    User: t.Object({ id: t.String(), name: t.String() })
  })
  .post("/", ({ body }) => ({ id: "user-1", name: body.name }), {
    body: createUser,
    response: "User"
  })
  .get("/:id", ({ params }) => ({ id: params.id, name: "Ada" }), {
    response: "User"
  })

export const app = new Nelysia()
  .use(users)
