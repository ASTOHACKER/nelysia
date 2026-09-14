import assert from "node:assert/strict"
import test from "node:test"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { gracefulShutdown, Nelysia, t as schema } from "../packages/core/src/index.ts"
import { createNodeServer } from "../packages/runtime-node/src/server.ts"
import WebSocket from "ws"

test("Node adapter handles JSON, malformed JSON, and body limits", async (t) => {
  const app = new Nelysia({ bodyLimit: 32 })
    .post("/users", ({ body }) => ({ received: body }))
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const url = `http://127.0.0.1:${address.port}`

  const valid = await fetch(`${url}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada" })
  })
  assert.equal(valid.status, 200)
  assert.deepEqual(await valid.json(), { received: { name: "Ada" } })
  assert.match(valid.headers.get("content-type") ?? "", /application\/json/)

  const malformed = await fetch(`${url}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{"
  })
  assert.equal(malformed.status, 400)

  const oversized = await fetch(`${url}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "This request is too long" })
  })
  assert.equal(oversized.status, 413)
})

test("validates JSON body before handler execution", async (t) => {
  let called = false
  const app = new Nelysia().post("/users", ({ body }) => {
    called = true
    return body
  }, { body: schema.Object({ name: schema.String(), age: schema.Number() }) })
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const response = await fetch(`http://127.0.0.1:${address.port}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Ada", age: "wrong" })
  })
  assert.equal(response.status, 400)
  assert.equal(called, false)
})

test("Node parser failures use the route error lifecycle", async (t) => {
  const app = new Nelysia()
    .onError((_error, context) => context.response(422, { handled: true }))
    .post("/parse-error", ({ body }) => body)
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const response = await fetch(`http://127.0.0.1:${address.port}/parse-error`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" })
  assert.equal(response.status, 422)
  assert.deepEqual(await response.json(), { handled: true })
})

test("Node adapter serves JSON params over HTTP", async (t) => {
  const app = new Nelysia().get("/users/:id", ({ params }) => ({ id: params.id }))
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const response = await fetch(`http://127.0.0.1:${address.port}/users/42`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { id: "42" })
})

test("Node adapter preserves a caller-provided request ID", async (t) => {
  const app = new Nelysia().get("/request-id", ({ requestId }) => requestId)
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const response = await fetch(`http://127.0.0.1:${address.port}/request-id`, { headers: { "x-request-id": "edge-42" } })
  assert.equal(await response.text(), "edge-42")
  assert.equal(response.headers.get("x-request-id"), "edge-42")
})

test("HEAD reuses GET route and sends no response body", async (t) => {
  const app = new Nelysia().get("/health", () => ({ ok: true }))
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const response = await fetch(`http://127.0.0.1:${address.port}/health`, { method: "HEAD" })
  assert.equal(response.status, 200)
  assert.equal(await response.text(), "")
})

test("streams native Response bodies through Node", async (t) => {
  const app = new Nelysia().get("/stream", () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("hello "))
      controller.enqueue(new TextEncoder().encode("stream"))
      controller.close()
    }
  }), { status: 201, headers: { "content-type": "text/plain" } }))
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const response = await fetch(`http://127.0.0.1:${address.port}/stream`)
  assert.equal(response.status, 201)
  assert.equal(await response.text(), "hello stream")
})

test("Node adapter upgrades WebSocket routes and dispatches messages", async (t) => {
  const events: string[] = []
  const app = new Nelysia().websocket("/events", {
    open(socket) { events.push("open"); socket.send("welcome") },
    message(socket, message) { events.push(String(message)); socket.send(`echo:${message}`) },
    close() { events.push("close") }
  })
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  t.after(() => server.close())
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const socket = new WebSocket(`ws://127.0.0.1:${address.port}/events`)
  const messages: string[] = []
  await new Promise<void>((resolve, reject) => {
    socket.on("open", () => socket.send("ping"))
    socket.on("message", (message) => {
      messages.push(message.toString())
      if (messages.length === 2) { socket.close(); resolve() }
    })
    socket.on("error", reject)
  })
  assert.deepEqual(messages, ["welcome", "echo:ping"])
  assert.deepEqual(events.slice(0, 2), ["open", "ping"])
})

test("graceful shutdown drains an active Node request", async () => {
  let release!: () => void
  const held = new Promise<void>((resolve) => { release = resolve })
  const app = new Nelysia().get("/slow", async () => { await held; return "finished" })
  const server = createNodeServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address()
  assert.ok(address && typeof address === "object")
  const request = fetch(`http://127.0.0.1:${address.port}/slow`)
  await new Promise((resolve) => setTimeout(resolve, 10))
  let shutdownFinished = false
  const shutdown = gracefulShutdown(server, 500).then(() => { shutdownFinished = true })
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(shutdownFinished, false)
  release()
  assert.equal(await (await request).text(), "finished")
  server.closeIdleConnections()
  await shutdown
  assert.equal(shutdownFinished, true)
})

test("clustered Node server forks a worker that serves compiled routes", async (t) => {
  const child = spawn(process.execPath, ["--experimental-strip-types", "examples/cluster/server.ts"], {
    env: { ...process.env, PORT: "0", WORKERS: "1" },
    stdio: ["ignore", "pipe", "inherit"],
  })
  t.after(() => {
    child.kill("SIGTERM")
  })
  let port = 0
  for await (const chunk of child.stdout as NodeJS.ReadableStream) {
    const match = /ready:(\d+)/.exec(chunk.toString())
    if (match) {
      port = Number(match[1])
      break
    }
  }
  assert.ok(port > 0)
  const response = await fetch(`http://127.0.0.1:${port}/json`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  child.kill("SIGTERM")
  await once(child, "exit")
})
