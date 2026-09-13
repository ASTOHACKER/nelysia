import { createServer } from "node:http"
import fastify from "fastify"
import express from "express"
import { Nelysia } from "../packages/core/src/index.ts"
import { createNodeServer } from "../packages/runtime-node/src/server.ts"

const framework = process.env.FRAMEWORK ?? "nelysia"
const port = Number(process.env.PORT ?? 4310)

if (framework === "nelysia") {
  const app = new Nelysia()
    .get("/json", () => ({ message: "hello", value: 42 }))
    .get("/users/:id", ({ params }) => ({ id: params.id }))
  createNodeServer(app).listen(port, () => console.log(`ready:${framework}:${port}`))
} else if (framework === "raw-node") {
  createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
    if (request.url?.startsWith("/users/")) {
      const id = request.url.slice("/users/".length)
      response.end(JSON.stringify({ id }))
    } else {
      response.end('{"message":"hello","value":42}')
    }
  }).listen(port, () => console.log(`ready:${framework}:${port}`))
} else if (framework === "fastify") {
  const app = fastify({ logger: false })
  app.get("/json", async () => ({ message: "hello", value: 42 }))
  app.get("/users/:id", async (request) => ({ id: (request.params as { id: string }).id }))
  await app.listen({ port, host: "127.0.0.1" })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "express") {
  const app = express()
  app.get("/json", (_request, response) => response.json({ message: "hello", value: 42 }))
  app.get("/users/:id", (request, response) => response.json({ id: request.params.id }))
  app.listen(port, "127.0.0.1", () => console.log(`ready:${framework}:${port}`))
} else {
  throw new Error(`Unknown framework: ${framework}`)
}
