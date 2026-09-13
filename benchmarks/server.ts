import { createServer } from "node:http"
import fastify from "fastify"
import express from "express"
import { Nelysia } from "../packages/core/src/index.ts"
import { createNodeServer } from "../packages/runtime-node/src/server.ts"

const framework = process.env.FRAMEWORK ?? "nelysia"
const port = Number(process.env.PORT ?? 4310)

if (framework === "nelysia") {
  // requestId disabled so the comparison measures routing/serialization like
  // raw/fastify/express, which do not generate a request id per request.
  const app = new Nelysia({ requestId: false }).get("/json", () => ({ message: "hello", value: 42 }))
  createNodeServer(app).listen(port, () => console.log(`ready:${framework}:${port}`))
} else if (framework === "raw-node") {
  createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
    response.end('{"message":"hello","value":42}')
  }).listen(port, () => console.log(`ready:${framework}:${port}`))
} else if (framework === "fastify") {
  const app = fastify({ logger: false })
  app.get("/json", async () => ({ message: "hello", value: 42 }))
  await app.listen({ port, host: "127.0.0.1" })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "express") {
  const app = express()
  app.get("/json", (_request, response) => response.json({ message: "hello", value: 42 }))
  app.listen(port, "127.0.0.1", () => console.log(`ready:${framework}:${port}`))
} else {
  throw new Error(`Unknown framework: ${framework}`)
}
