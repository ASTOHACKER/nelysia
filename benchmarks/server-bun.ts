import { Nelysia } from "../packages/core/src/index.ts"
import { createCompiledBunHandler } from "../packages/compiler/src/index.ts"
import { createBunHandler } from "../packages/runtime-bun/src/server.ts"
import { Elysia } from "elysia"

const framework = process.env.FRAMEWORK ?? "nelysia-bun-static"
const port = Number(process.env.PORT ?? 4310)

if (framework === "raw-bun") {
  const jsonHeader = { "content-type": "application/json; charset=utf-8" }
  Bun.serve({
    port,
    fetch(req) {
      const url = req.url
      if (url.includes("/users/")) {
        const id = url.slice(url.lastIndexOf("/") + 1)
        return new Response(JSON.stringify({ id }), { headers: jsonHeader })
      }
      return new Response('{"message":"hello","value":42}', { headers: jsonHeader })
    }
  })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "nelysia-bun-static") {
  const app = new Nelysia()
    .getStatic("/json", { message: "hello", value: 42 })
    .get("/users/:id", ({ params }) => ({ id: params.id }))
  const handler = createCompiledBunHandler(app)
  Bun.serve({ port, fetch: handler })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "nelysia-bun-compiled") {
  const app = new Nelysia()
    .get("/json", () => ({ message: "hello", value: 42 }))
    .get("/users/:id", ({ params }) => ({ id: params.id }))
  const handler = createCompiledBunHandler(app)
  Bun.serve({ port, fetch: handler })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "nelysia-bun-standard") {
  const app = new Nelysia()
    .get("/json", () => ({ message: "hello", value: 42 }))
    .get("/users/:id", ({ params }) => ({ id: params.id }))
  const handler = createBunHandler(app)
  Bun.serve({ port, fetch: handler })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "elysia-bun") {
  const app = new Elysia()
    .get("/json", () => ({ message: "hello", value: 42 }))
    .get("/users/:id", (context: { params?: Record<string, string> }) => ({ id: context.params?.id ?? "42" }))
    .listen(port)
  console.log(`ready:${framework}:${port}`)
} else {
  throw new Error(`Unknown framework: ${framework}`)
}
