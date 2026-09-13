import assert from "node:assert/strict"
import test from "node:test"
import { Nelysia } from "../packages/core/src/index.ts"
import { jwt, signJwt, verifyJwt } from "../packages/jwt/src/index.ts"

const SECRET = "super-secret-key-1234567890-test"

test("signs and verifies JWT tokens correctly", async () => {
  const token = await signJwt({ sub: "user-1", role: "admin" }, SECRET, { expiresIn: 3600 })
  assert.ok(typeof token === "string")
  assert.equal(token.split(".").length, 3)

  const res = await verifyJwt(token, SECRET)
  assert.equal(res.valid, true)
  assert.equal(res.payload?.sub, "user-1")
  assert.equal(res.payload?.role, "admin")
})

test("detects expired and invalid JWT tokens", async () => {
  // Expired token (expires in -10 seconds)
  const expiredToken = await signJwt({ sub: "user-1" }, SECRET, { expiresIn: -10 })
  const resExpired = await verifyJwt(expiredToken, SECRET)
  assert.equal(resExpired.valid, false)
  assert.equal(resExpired.reason, "expired")

  // Invalid signature (signed with different secret)
  const otherToken = await signJwt({ sub: "user-1" }, "different-secret-key-00000000000")
  const resInvalid = await verifyJwt(otherToken, SECRET)
  assert.equal(resInvalid.valid, false)
  assert.equal(resInvalid.reason, "invalid")

  // Malformed token
  const resMalformed = await verifyJwt("not.a.token", SECRET)
  assert.equal(resMalformed.valid, false)
  assert.equal(resMalformed.reason, "malformed")
})

test("Nelysia JWT plugin enforces auth on protected routes and leaves public routes untouched", async () => {
  const app = new Nelysia()
    .use(jwt({ secret: SECRET }))
    .get("/public", () => ({ status: "open" }))
    .get("/profile", ({ auth }) => ({ status: "authenticated", user: auth }), { auth: "jwt" })

  // 1. Public route: zero auth requirement
  const pubRes = await app.inject({ method: "GET", path: "/public" })
  assert.equal(pubRes.statusCode, 200)
  assert.deepEqual(await pubRes.json(), { status: "open" })

  // 2. Protected route: missing token -> 401
  const missingRes = await app.inject({ method: "GET", path: "/profile" })
  assert.equal(missingRes.statusCode, 401)
  assert.equal((await missingRes.json<{ error: string }>()).error, "Unauthorized")

  // 3. Protected route: invalid token -> 401
  const invalidRes = await app.inject({
    method: "GET",
    path: "/profile",
    headers: { authorization: "Bearer invalid.token.payload" }
  })
  assert.equal(invalidRes.statusCode, 401)

  // 4. Protected route: expired token -> 401
  const expiredToken = await signJwt({ sub: "user-42" }, SECRET, { expiresIn: -5 })
  const expiredRes = await app.inject({
    method: "GET",
    path: "/profile",
    headers: { authorization: `Bearer ${expiredToken}` }
  })
  assert.equal(expiredRes.statusCode, 401)

  // 5. Protected route: valid token -> 200 + context.auth
  const validToken = await signJwt({ sub: "user-42", name: "Alice" }, SECRET, { expiresIn: 60 })
  const validRes = await app.inject({
    method: "GET",
    path: "/profile",
    headers: { authorization: `Bearer ${validToken}` }
  })
  assert.equal(validRes.statusCode, 200)
  const body = await validRes.json<{ status: string; user: { sub: string; name: string } }>()
  assert.equal(body.status, "authenticated")
  assert.equal(body.user.sub, "user-42")
  assert.equal(body.user.name, "Alice")
})
