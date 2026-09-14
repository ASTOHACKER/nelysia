import { Nelysia, t } from "../packages/core/src/index.ts"

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
