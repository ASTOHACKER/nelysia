import assert from "node:assert/strict"
import test from "node:test"
import { Nelysia } from "../packages/core/src/index.ts"
import { logger } from "../packages/logger/src/index.ts"
import { timeout } from "../packages/timeout/src/index.ts"
import { memoryStorage, upload } from "../packages/upload/src/index.ts"
import { importHmacKey, signJwt, verifyJwt } from "../packages/jwt/src/index.ts"
import { createNodeServer } from "../packages/runtime-node/src/server.ts"

test("JWT rejects non-HS256 algorithms and enforces optional issuer/audience", async () => {
  const token = await signJwt({ sub: "user-1", iss: "issuer-a", aud: ["api", "web"] }, "secret-key-1234567890")
  const [header, payload, signature] = token.split(".")
  const encodedNoneHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url")
  const algorithmConfusion = await verifyJwt(`${encodedNoneHeader}.${payload}.${signature}`, "secret-key-1234567890")
  assert.equal(algorithmConfusion.valid, false)
  assert.equal(algorithmConfusion.reason, "invalid")

  assert.equal((await verifyJwt(token, "secret-key-1234567890", { issuer: "issuer-a", audience: "api" })).valid, true)
  assert.equal((await verifyJwt(token, "secret-key-1234567890", { issuer: "issuer-b" })).valid, false)
  assert.equal((await verifyJwt(token, "secret-key-1234567890", { audience: "mobile" })).valid, false)
})

test("JWT rejects non-object payloads and malformed registered claim types", async () => {
  const secret = "strict-jwt-shape-secret"
  const valid = await signJwt({ sub: "user-1" }, secret)
  const [header] = valid.split(".")
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const signPayload = async (payload: unknown) => {
    const encodedPayload = encode(payload)
    const key = await importHmacKey(secret)
    const data = `${header}.${encodedPayload}`
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))
    return `${data}.${Buffer.from(signature).toString("base64url")}`
  }
  const arrayPayload = await verifyJwt(await signPayload([]), secret)
  assert.equal(arrayPayload.valid, false)
  assert.equal(arrayPayload.reason, "malformed")
  const invalidAudience = await verifyJwt(await signPayload({ aud: ["api", 1] }), secret)
  assert.equal(invalidAudience.valid, false)
  assert.equal(invalidAudience.reason, "invalid")
  const invalidIssuedAt = await verifyJwt(await signPayload({ iat: "now" }), secret)
  assert.equal(invalidIssuedAt.valid, false)
  assert.equal(invalidIssuedAt.reason, "invalid")
})

test("JWT rejects non-canonical base64url aliases", async () => {
  const secret = "canonical-jwt-shape-secret"
  const token = await signJwt({ sub: "user-1" }, secret)
  const [header, payload, signature] = token.split(".")
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
  const last = signature.at(-1)!
  const index = alphabet.indexOf(last)
  assert.notEqual(index, -1)
  const alternate = alphabet[(index & 0b111100) | 1]
  if (alternate === last) return
  const result = await verifyJwt(`${header}.${payload}.${signature.slice(0, -1)}${alternate}`, secret)
  assert.equal(result.valid, false)
  assert.equal(result.reason, "malformed")
})

test("timeout plugin aborts the handler and returns 504 without an unhandled rejection", async () => {
  let signal: AbortSignal | undefined
  const app = new Nelysia()
    .use(timeout({ timeoutMs: 10 }))
    .get("/slow", async (context) => {
      signal = context.signal
      await new Promise((resolve) => setTimeout(resolve, 100))
      return "too late"
    })

  const response = await app.inject({ method: "GET", path: "/slow" })
  assert.equal(response.status, 504)
  assert.equal((await response.json<{ error: string }>()).error, "Request Timeout")
  assert.equal(signal?.aborted, true)
})

test("logger plugin emits request metadata and redacts sensitive fields", async () => {
  const entries: Array<{ message: string; fields?: Record<string, unknown> }> = []
  const app = new Nelysia()
    .use(logger({ sink: (entry) => { entries.push(entry) } }))
    .get("/log", ({ logger: routeLogger }) => {
      routeLogger?.info("custom", { authorization: "Bearer secret", safe: "ok" })
      routeLogger?.info("url", { url: "/search?token=secret&safe=yes", message: "Bearer another-secret" })
      return "ok"
    })

  assert.equal((await app.inject({ method: "GET", path: "/log" })).status, 200)
  const custom = entries.find((entry) => entry.message === "custom")
  assert.equal(custom?.fields?.authorization, "[REDACTED]")
  assert.equal(custom?.fields?.safe, "ok")
  assert.ok(entries.some((entry) => entry.message === "request.complete"))

  const complete = entries.find((entry) => entry.message === "request.complete")
  assert.equal(complete?.fields?.url, "/log")
  const urlEntry = entries.find((entry) => entry.message === "url")
  assert.equal(urlEntry?.fields?.url, "/search?token=%5BREDACTED%5D&safe=yes")
  assert.equal(urlEntry?.fields?.message, "Bearer [REDACTED]")
})

test("upload plugin exposes multipart files and enforces storage contract", async () => {
  const app = new Nelysia()
    .use(upload({ storage: memoryStorage(), maxFileSize: 100, maxFiles: 2 }))
    .post("/upload", ({ files }) => ({
      name: files?.image?.[0]?.filename,
      size: files?.image?.[0]?.size,
      stored: files?.image?.[0]?.storage instanceof File
    }))
  const form = new FormData()
  form.append("image", new File(["hello"], "hello.txt", { type: "text/plain" }))
  const response = await app.inject({ method: "POST", path: "/upload", body: form })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { name: "hello.txt", size: 5, stored: true })

  const tooLarge = new FormData()
  tooLarge.append("image", new File(["0123456789"], "large.txt"))
  const limited = await new Nelysia().use(upload({ maxFileSize: 5 })).post("/upload", ({ files }) => files)
  assert.equal((await limited.inject({ method: "POST", path: "/upload", body: tooLarge })).status, 413)
})

test("Node adapter preserves the Web multipart contract for upload", async (t) => {
  const app = new Nelysia()
    .use(upload({ storage: memoryStorage() }))
    .post("/upload", ({ files }) => ({ filename: files?.image?.[0]?.filename }))
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const form = new FormData()
  form.append("image", new File(["adapter"], "adapter.txt", { type: "text/plain" }))
  const response = await fetch(`http://127.0.0.1:${address.port}/upload`, { method: "POST", body: form })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { filename: "adapter.txt" })
})
