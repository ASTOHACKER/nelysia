import { createServer } from "node:http"
import fastify from "fastify"
import express from "express"
import { Hono } from "hono"
import { Nelysia } from "../packages/core/src/index.ts"
import { createNodeServer } from "../packages/runtime-node/src/server.ts"

const framework = process.env.FRAMEWORK ?? "nelysia"
const port = Number(process.env.PORT ?? 4310)
const routeSet = process.env.BENCH_ROUTE_SET === "single" ? "single" : "multi"
const benchCase = process.env.BENCH_CASE === "dynamic" ? "dynamic" : "json"
const routeCount = Math.max(routeSet === "single" ? 1 : 2, Number(process.env.BENCH_ROUTE_COUNT ?? (routeSet === "single" ? 1 : 2)))
const opaqueContextField = process.env.BENCH_CONTEXT_FIELD ?? "request"
const opaqueParamsField = process.env.BENCH_PARAMS_FIELD ?? "params"

function addNelysiaFillerRoutes(app: Nelysia): Nelysia {
  const baseRouteCount = routeSet === "multi" ? 2 : 1
  for (let index = baseRouteCount; index < routeCount; index++) {
    if (benchCase === "dynamic") app.get(`/users/bench-${index}/:id`, ({ params }) => ({ id: params.id }))
    else app.get(`/bench/${index}`, () => ({ message: "hello", value: 42 }))
  }
  return app
}

function addFastifyFillerRoutes(app: ReturnType<typeof fastify>): ReturnType<typeof fastify> {
  const baseRouteCount = routeSet === "multi" ? 2 : 1
  for (let index = baseRouteCount; index < routeCount; index++) {
    if (benchCase === "dynamic") app.get(`/users/bench-${index}/:id`, async (request) => ({ id: (request.params as { id: string }).id }))
    else app.get(`/bench/${index}`, async () => ({ message: "hello", value: 42 }))
  }
  return app
}

function addExpressFillerRoutes(app: ReturnType<typeof express>): ReturnType<typeof express> {
  const baseRouteCount = routeSet === "multi" ? 2 : 1
  for (let index = baseRouteCount; index < routeCount; index++) {
    if (benchCase === "dynamic") app.get(`/users/bench-${index}/:id`, (request, response) => response.json({ id: request.params.id }))
    else app.get(`/bench/${index}`, (_request, response) => response.json({ message: "hello", value: 42 }))
  }
  return app
}

function addHonoFillerRoutes(app: Hono): Hono {
  const baseRouteCount = routeSet === "multi" ? 2 : 1
  for (let index = baseRouteCount; index < routeCount; index++) {
    if (benchCase === "dynamic") app.get(`/users/bench-${index}/:id`, (context) => context.json({ id: context.req.param("id") }))
    else app.get(`/bench/${index}`, (context) => context.json({ message: "hello", value: 42 }))
  }
  return app
}

if (framework === "nelysia" || framework === "nelysia-generic") {
  // requestId disabled so the comparison measures routing/serialization like
  // raw/fastify/express, which do not generate a request id per request.
  // nelysia-generic adds a no-op lifecycle hook and dynamic context access to
  // exercise the runtime fallback rather than a known/compiled lane.
  const app = new Nelysia({ requestId: false })
  if (framework === "nelysia-generic") app.onBeforeHandle(() => {})
  if (benchCase === "dynamic") {
    if (framework === "nelysia-generic") app.get("/users/:id", (context) => {
      const params = (context as unknown as Record<string, unknown>)[opaqueParamsField] as { id: string }
      return { id: params.id }
    })
    else app.get("/users/:id", ({ params }) => ({ id: params.id }))
  } else if (framework === "nelysia-generic") app.get("/json", (context) => {
    void (context as unknown as Record<string, unknown>)[opaqueContextField]
    return { message: "hello", value: 42 }
  })
  else app.get("/json", () => ({ message: "hello", value: 42 }))
  if (routeSet === "multi") {
    if (benchCase === "dynamic") app.get("/json", () => ({ message: "hello", value: 42 }))
    else app.get("/users/:id", ({ params }) => ({ id: params.id }))
  }
  createNodeServer(addNelysiaFillerRoutes(app)).listen(port, () => console.log(`ready:${framework}:${port}`))
} else if (framework === "raw-node") {
  createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" })
    if (request.url?.startsWith("/users/")) {
      const id = request.url.slice("/users/".length)
      response.end(JSON.stringify({ id }))
    } else {
      response.end(JSON.stringify({ message: "hello", value: 42 }))
    }
  }).listen(port, () => console.log(`ready:${framework}:${port}`))
} else if (framework === "fastify") {
  const app = fastify({ logger: false })
  if (benchCase === "dynamic") app.get("/users/:id", async (request) => ({ id: (request.params as { id: string }).id }))
  else app.get("/json", async () => ({ message: "hello", value: 42 }))
  if (routeSet === "multi") {
    if (benchCase === "dynamic") app.get("/json", async () => ({ message: "hello", value: 42 }))
    else app.get("/users/:id", async (request) => ({ id: (request.params as { id: string }).id }))
  }
  await addFastifyFillerRoutes(app).listen({ port, host: "127.0.0.1" })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "express") {
  const app = express()
  if (benchCase === "dynamic") app.get("/users/:id", (request, response) => response.json({ id: request.params.id }))
  else app.get("/json", (_request, response) => response.json({ message: "hello", value: 42 }))
  if (routeSet === "multi") {
    if (benchCase === "dynamic") app.get("/json", (_request, response) => response.json({ message: "hello", value: 42 }))
    else app.get("/users/:id", (request, response) => response.json({ id: request.params.id }))
  }
  addExpressFillerRoutes(app).listen(port, "127.0.0.1", () => console.log(`ready:${framework}:${port}`))
} else if (framework === "hono-node") {
  const app = new Hono()
  if (benchCase === "dynamic") app.get("/users/:id", (context) => context.json({ id: context.req.param("id") }))
  else app.get("/json", (context) => context.json({ message: "hello", value: 42 }))
  if (routeSet === "multi") {
    if (benchCase === "dynamic") app.get("/json", (context) => context.json({ message: "hello", value: 42 }))
    else app.get("/users/:id", (context) => context.json({ id: context.req.param("id") }))
  }
  addHonoFillerRoutes(app)
  createServer(async (request, response) => {
    const target = `http://127.0.0.1:${port}${request.url ?? "/"}`
    const result = await app.fetch(new Request(target, { method: request.method, headers: request.headers as HeadersInit }))
    response.writeHead(result.status, Object.fromEntries(result.headers))
    response.end(new Uint8Array(await result.arrayBuffer()))
  }).listen(port, () => console.log(`ready:${framework}:${port}`))
} else {
  throw new Error(`Unknown framework: ${framework}`)
}
