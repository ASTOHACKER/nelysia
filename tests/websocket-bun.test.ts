import assert from "node:assert/strict"
import test from "node:test"
import { Nelysia } from "../packages/core/src/index.ts"

test("Bun WebSocket upgrade and message lifecycle", async () => {
  if (!("Bun" in globalThis)) return

  const events: string[] = []
  const app = new Nelysia().websocket("/events", {
    open(socket) {
      events.push("open")
      socket.send("welcome")
    },
    message(socket, message) {
      events.push(`message:${message}`)
      socket.send(`echo:${message}`)
    },
    close() {
      events.push("close")
    }
  })
  const server = app.listen(0) as { port: number; stop(): void }
  const messages: string[] = []
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}/events`)
  const complete = new Promise<void>((resolve, reject) => {
    socket.addEventListener("message", (event) => {
      messages.push(String(event.data))
      if (messages.length === 2) {
        socket.close()
        resolve()
      }
    })
    socket.addEventListener("error", () => reject(new Error("WebSocket error")))
  })
  await new Promise<void>((resolve) => socket.addEventListener("open", () => resolve(), { once: true }))
  socket.send("ping")
  await complete
  server.stop()
  assert.deepEqual(messages, ["welcome", "echo:ping"])
  assert.deepEqual(events.slice(0, 2), ["open", "message:ping"])
})
