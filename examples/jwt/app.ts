import { Nelysia } from "../../packages/core/src/index.ts"
import { jwt, signJwt } from "../../packages/jwt/src/index.ts"

const secret = process.env.JWT_SECRET
if (!secret) throw new Error("JWT_SECRET is required")

export const app = new Nelysia()
  .use(jwt({ secret, expiresIn: 7 * 86400 }))
  .get("/sign/:name", async ({ params }) => {
    const token = await signJwt({ name: params.name }, secret, { expiresIn: 7 * 86400 })
    return { token }
  })
  .get("/profile", ({ auth }) => {
    const profile = auth as { name?: string }
    return `Hello ${profile.name ?? "user"}`
  }, { auth: "jwt" })
