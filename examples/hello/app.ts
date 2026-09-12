import { Nelysia } from "../../packages/core/src/index.ts"

export const app = new Nelysia()
  .get("/", "Hello from Nelysia")
  .get("/users/:id", ({ params }) => ({ id: params.id }))
