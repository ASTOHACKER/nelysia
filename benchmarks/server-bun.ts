import { Nelysia } from "../packages/core/src/index.ts"
import { createCompiledBunHandler } from "../packages/compiler/src/index.ts"
import { compileDispatcher } from "../packages/compiler/src/dispatcher.ts"
import { createBunHandler } from "../packages/runtime-bun/src/server.ts"
import { Elysia } from "elysia"
import { Hono } from "hono"

const framework = process.env.FRAMEWORK ?? "nelysia-bun-static"
const port = Number(process.env.PORT ?? 4310)
const routeSet = process.env.BENCH_ROUTE_SET === "single" ? "single" : "multi"
const benchCase = process.env.BENCH_CASE === "dynamic" ? "dynamic" : "json"
const routeCount = Math.max(routeSet === "single" ? 1 : 2, Number(process.env.BENCH_ROUTE_COUNT ?? (routeSet === "single" ? 1 : 2)))
// Keep the generic fixture genuinely opaque to the route planner. The runtime
// value is stable for a run, but the handler source uses a dynamic key rather
// than a statically inferable literal member access.
const opaqueContextField = process.env.BENCH_CONTEXT_FIELD ?? "request"
const opaqueParamsField = process.env.BENCH_PARAMS_FIELD ?? "params"

function addNelysiaFillerRoutes(app: Nelysia): Nelysia {
  const baseRouteCount = routeSet === "multi" ? 2 : 1
  for (let index = baseRouteCount; index < routeCount; index++) {
    if (benchCase === "json") app.get(`/bench/${index}`, () => ({ message: "hello", value: 42 }))
    else app.get(`/users/bench-${index}/:id`, ({ params }) => ({ id: params.id }))
  }
  return app
}

function addElysiaFillerRoutes(app: Elysia): Elysia {
  const baseRouteCount = routeSet === "multi" ? 2 : 1
  for (let index = baseRouteCount; index < routeCount; index++) {
    if (benchCase === "json") app.get(`/bench/${index}`, () => ({ message: "hello", value: 42 }))
    else app.get(`/users/bench-${index}/:id`, (context: { params?: Record<string, string> }) => ({ id: context.params?.id ?? "42" }))
  }
  return app
}

function addHonoFillerRoutes(app: Hono): Hono {
  const baseRouteCount = routeSet === "multi" ? 2 : 1
  for (let index = baseRouteCount; index < routeCount; index++) {
    if (benchCase === "json") app.get(`/bench/${index}`, (context) => context.json({ message: "hello", value: 42 }))
    else app.get(`/users/bench-${index}/:id`, (context) => context.json({ id: context.req.param("id") }))
  }
  return app
}

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

function buildNelysia(routeKind: "static" | "zero-arg" | "params" | "standard" | "generic"): Nelysia {
  const app = new Nelysia({ requestId: false })
  // Runtime-fallback fixture: the lifecycle hook must keep app.listen() out
  // of the compiled dispatcher. The opaque access below keeps this target on
  // the full-context runtime fallback.
  if (routeKind === "generic") app.onBeforeHandle(() => {})
  if (benchCase === "json") {
    if (routeKind === "static") app.getStatic("/json", { message: "hello", value: 42 })
    else if (routeKind === "generic") app.get("/json", (context) => {
      void (context as unknown as Record<string, unknown>)[opaqueContextField]
      return { message: "hello", value: 42 }
    })
    else app.get("/json", () => ({ message: "hello", value: 42 }))
  } else {
    if (routeKind === "generic") app.get("/users/:id", (context) => {
      const params = (context as unknown as Record<string, unknown>)[opaqueParamsField] as { id: string }
      return { id: params.id }
    })
    else app.get("/users/:id", ({ params }) => ({ id: params.id }))
  }
  if (routeKind === "generic" && compileDispatcher(app).routes.length !== 0) throw new Error("generic benchmark must use the runtime fallback")
  if (routeSet === "multi") addOtherRoute(app, routeKind === "generic" ? "standard" : routeKind)
  return addNelysiaFillerRoutes(app)
}

function buildElysia(generic = false): Elysia {
  const app = new Elysia()
  if (generic) app.beforeHandle(() => {})
  if (benchCase === "json") {
    if (generic) app.get("/json", (context) => {
      void (context as unknown as Record<string, unknown>)[opaqueContextField]
      return { message: "hello", value: 42 }
    })
    else app.get("/json", () => ({ message: "hello", value: 42 }))
  }
  else if (generic) app.get("/users/:id", (context) => {
    const params = (context as unknown as Record<string, unknown>)[opaqueParamsField] as { id?: string }
    return { id: params?.id ?? "42" }
  })
  else app.get("/users/:id", (context: { params?: Record<string, string> }) => ({ id: context.params?.id ?? "42" }))
  if (routeSet === "multi") {
    if (benchCase === "json") app.get("/users/:id", (context: { params?: Record<string, string> }) => ({ id: context.params?.id ?? "42" }))
    else app.get("/json", () => ({ message: "hello", value: 42 }))
  }
  return addElysiaFillerRoutes(app)
}

function buildHono(): Hono {
  const app = new Hono()
  if (benchCase === "json") app.get("/json", (context) => context.json({ message: "hello", value: 42 }))
  else app.get("/users/:id", (context) => context.json({ id: context.req.param("id") }))
  if (routeSet === "multi") {
    if (benchCase === "json") app.get("/users/:id", (context) => context.json({ id: context.req.param("id") }))
    else app.get("/json", (context) => context.json({ message: "hello", value: 42 }))
  }
  return addHonoFillerRoutes(app)
}

function startNelysiaWithSelectedEntrypoint(app: Nelysia, framework: string): void {
  if (process.env.BENCH_ENTRYPOINT === "listen") {
    app.listen(port)
    console.log(`ready:${framework}:${port}`)
    return
  }
  const handler = createCompiledBunHandler(app)
  Bun.serve({ port, fetch: handler })
  console.log(`ready:${framework}:${port}`)
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
      return new Response(JSON.stringify({ message: "hello", value: 42 }), { headers: jsonHeader })
    }
  })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "nelysia-bun-static") {
  const app = buildNelysia("static")
  startNelysiaWithSelectedEntrypoint(app, framework)
} else if (framework === "nelysia-bun-zero-arg" || framework === "nelysia-bun-compiled") {
  const app = buildNelysia("zero-arg")
  startNelysiaWithSelectedEntrypoint(app, framework)
} else if (framework === "nelysia-bun-params") {
  const app = buildNelysia("params")
  startNelysiaWithSelectedEntrypoint(app, framework)
} else if (framework === "nelysia-bun-standard") {
  const app = buildNelysia("standard")
  const handler = createBunHandler(app)
  Bun.serve({ port, fetch: handler })
  console.log(`ready:${framework}:${port}`)
} else if (framework === "nelysia-bun-generic" || framework === "nelysia-bun-generic-listen") {
  const app = buildNelysia("generic")
  // Respect BENCH_ENTRYPOINT so the generic lane is measurable both as a
  // direct createBunHandler() (handler) and as public app.listen() (listen).
  // app.listen() with the opaque hook stays GENERIC and bypasses compiled
  // dispatch with an identical payload.
  if (process.env.BENCH_ENTRYPOINT === "listen") {
    app.listen(port)
    console.log(`ready:${framework}:${port}`)
  } else {
    const handler = createBunHandler(app)
    Bun.serve({ port, fetch: handler })
    console.log(`ready:${framework}:${port}`)
  }
} else if (framework === "elysia-bun" || framework === "elysia-bun-generic") {
  const app = buildElysia(framework === "elysia-bun-generic").listen(port)
  console.log(`ready:${framework}:${port}`)
} else if (framework === "hono-bun") {
  const app = buildHono()
  Bun.serve({ port, fetch: app.fetch })
  console.log(`ready:${framework}:${port}`)
} else {
  throw new Error(`Unknown framework: ${framework}`)
}
