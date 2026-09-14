import { Nelysia } from "../packages/core/src/index.ts"
import { jwt, importHmacKey, verifyJwt } from "../packages/jwt/src/index.ts"
import { createCompiledBunHandler } from "../packages/compiler/src/index.ts"
import { Hono } from "hono"
import { jwt as honoJwt } from "hono/jwt"
import { Elysia } from "elysia"

const JWT_SECRET = "nelysia-benchmark-secret-key-1234567890"
const framework = process.env.FRAMEWORK ?? "nelysia"
const port = Number(process.env.PORT ?? 4330)

async function start() {
  if (framework === "nelysia") {
    const app = new Nelysia()
      .use(jwt({ secret: JWT_SECRET }))
      .get("/public", () => ({ status: "open" }))
      .get("/profile", ({ auth }) => ({ status: "authenticated", user: auth }), { auth: "jwt" })

    Bun.serve({
      port,
      fetch: createCompiledBunHandler(app)
    })
    console.log(`ready:${framework}:${port}`)
  } else if (framework === "hono") {
    const app = new Hono()
    app.get("/public", (c) => c.json({ status: "open" }))
    app.use("/profile", honoJwt({ secret: JWT_SECRET, alg: "HS256" }))
    app.get("/profile", (c) => c.json({ status: "authenticated", user: c.get("jwtPayload") }))

    Bun.serve({
      port,
      fetch: app.fetch
    })
    console.log(`ready:${framework}:${port}`)
  } else if (framework === "elysia") {
    const key = await importHmacKey(JWT_SECRET)
    const app = new Elysia()
      .get("/public", () => ({ status: "open" }))
      .guard(
        {
          beforeHandle: async ({ headers, set }: { headers: Record<string, string | undefined>; set: { status?: number } }) => {
            const authHeader = headers["authorization"]
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
              set.status = 401
              return { error: "Unauthorized" }
            }
            const token = authHeader.slice(7).trim()
            const verification = await verifyJwt(token, key)
            if (!verification.valid) {
              set.status = 401
              return { error: "Unauthorized" }
            }
          }
        },
        (app) => app.get("/profile", () => ({ status: "authenticated" }))
      )

    Bun.serve({
      port,
      fetch: app.fetch
    })
    console.log(`ready:${framework}:${port}`)
  } else {
    throw new Error(`Unknown framework: ${framework}`)
  }
}

start().catch(console.error)
