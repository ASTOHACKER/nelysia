import { Nelysia } from "../packages/core/src/index.ts"
import { createCompiledBunHandler } from "../packages/compiler/src/index.ts"
import { createBunHandler } from "../packages/runtime-bun/src/server.ts"
import { Elysia } from "elysia"

const framework = process.env.FRAMEWORK ?? "nelysia-static"
const port = Number(process.env.PORT ?? 4380)

if (framework === "nelysia-static") {
  const app = new Nelysia()
    .getStatic("/plaintext", "Hello, World!")
    .getStatic("/json", { message: "Hello, World!" })
  Bun.serve({
    port,
    fetch: createCompiledBunHandler(app)
  })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "nelysia-route") {
  const app = new Nelysia()
    .get("/plaintext", () => "Hello, World!")
    .get("/json", () => ({ message: "Hello, World!" }))
  Bun.serve({
    port,
    fetch: createCompiledBunHandler(app)
  })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "nelysia-standard") {
  const app = new Nelysia()
    .get("/plaintext", () => "Hello, World!")
    .get("/json", () => ({ message: "Hello, World!" }))
  Bun.serve({
    port,
    fetch: createBunHandler(app)
  })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "elysia") {
  const plainHeaders = { "content-type": "text/plain", "server": "Elysia" }
  const jsonHeaders = { "content-type": "application/json", "server": "Elysia" }
  const app = new Elysia()
    .get("/plaintext", () => new Response("Hello, World!", { headers: plainHeaders }))
    .get("/json", () => new Response('{"message":"Hello, World!"}', { headers: jsonHeaders }))
    .listen(port)
  console.log(`ready:${framework}:${port}`)
} else if (framework === "raw-bun") {
  const plainHeaders = { "content-type": "text/plain", "server": "Bun" }
  const jsonHeaders = { "content-type": "application/json", "server": "Bun" }
  Bun.serve({
    port,
    fetch(req) {
      if (req.url.endsWith("/plaintext")) {
        return new Response("Hello, World!", { headers: plainHeaders })
      }
      return new Response('{"message":"Hello, World!"}', { headers: jsonHeaders })
    }
  })
  console.log(`ready:${framework}:${port}`)
} else {
  throw new Error(`Unknown framework: ${framework}`)
}
