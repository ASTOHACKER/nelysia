import { Nelysia } from "@narudom96/nelysia"

export const app = new Nelysia()
  .get("/", "Hello from Nelysia")
  .get("/users/:id", ({ params }) => ({ id: params.id }))
