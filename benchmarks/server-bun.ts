import { Nelysia } from "../packages/core/src/index.ts"
import { createCompiledBunHandler } from "../packages/compiler/src/index.ts"
import { createBunHandler } from "../packages/runtime-bun/src/server.ts"
import { Elysia } from "elysia"

const framework = process.env.FRAMEWORK ?? "nelysia-bun-static"
const port = Number(process.env.PORT ?? 4310)
const routeSet = process.env.BENCH_ROUTE_SET === "single" ? "single" : "multi"
const benchCase = process.env.BENCH_CASE === "dynamic" ? "dynamic" : "json"

function addOtherRoute(app: Nelysia, routeKind: "static" | "zero-arg" | "params" | "standard"): Nelysia {
  if (benchCase === "json") {
    app.get("/users/:id", ({ params }) => ({ id: params.id }))
  } else if (routeKind === "static") {
    app.getStatic("/json", { message: "hello", value: 42 })
  } else {
    app.get("/json", () => ({ message: "hello", value: 42 }))
  }
  return app
}

function buildNelysia(routeKind: "static" | "zero-arg" | "params" | "standard"): Nelysia {
  const app = new Nelysia({ requestId: false })
  if (benchCase === "json") {
    if (routeKind === "static") app.getStatic("/json", { message: "hello", value: 42 })
    else app.get("/json", () => ({ message: "hello", value: 42 }))
  } else {
    app.get("/users/:id", ({ params }) => ({ id: params.id }))
  }
  if (routeSet === "multi") addOtherRoute(app, routeKind)
  return app
}

function buildElysia(): Elysia {
  const app = new Elysia()
  if (benchCase === "json") app.get("/json", () => ({ message: "hello", value: 42 }))
  else app.get("/users/:id", (context: { params?: Record<string, string> }) => ({ id: context.params?.id ?? "42" }))
  if (routeSet === "multi") {
    if (benchCase === "json") app.get("/users/:id", (context: { params?: Record<string, string> }) => ({ id: context.params?.id ?? "42" }))
    else app.get("/json", () => ({ message: "hello", value: 42 }))
  }
  return app
}

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
  const app = buildNelysia("static")
  const handler = createCompiledBunHandler(app)
  Bun.serve({ port, fetch: handler })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "nelysia-bun-zero-arg" || framework === "nelysia-bun-compiled") {
  const app = buildNelysia("zero-arg")
  const handler = createCompiledBunHandler(app)
  Bun.serve({ port, fetch: handler })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "nelysia-bun-params") {
  const app = buildNelysia("params")
  const handler = createCompiledBunHandler(app)
  Bun.serve({ port, fetch: handler })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "nelysia-bun-standard") {
  const app = buildNelysia("standard")
  const handler = createBunHandler(app)
  Bun.serve({ port, fetch: handler })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "elysia-bun") {
  const app = buildElysia().listen(port)
  console.log(`ready:${framework}:${port}`)
} else {
  throw new Error(`Unknown framework: ${framework}`)
}
