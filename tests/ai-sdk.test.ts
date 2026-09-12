import assert from "node:assert/strict"
import test from "node:test"
import { MockLanguageModelV3 } from "ai/test"
import { app, createAiSdkApp, mockModel } from "../examples/ai-sdk/app.ts"
import { createFetchHandler } from "../packages/runtime-fetch/src/server.ts"

test("AI SDK route uses generateText with the deterministic model", async () => {
  const response = await createFetchHandler(app)(new Request("https://example.test/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "Say hello" })
  }))

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { text: "Deterministic AI SDK response" })
  assert.equal(mockModel.doGenerateCalls.length, 1)
})

test("AI SDK route accepts an injected model and validates input", async () => {
  const calls: string[] = []
  const model = new MockLanguageModelV3({
    doGenerate: async (options) => {
      calls.push("called")
      return mockModel.doGenerate(options)
    }
  })
  const handler = createFetchHandler(createAiSdkApp(model))

  const invalid = await handler(new Request("https://example.test/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: 42 })
  }))
  assert.equal(invalid.status, 400)

  const valid = await handler(new Request("https://example.test/ai", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: "Summarize this" })
  }))
  assert.equal(valid.status, 200)
  assert.deepEqual(calls, ["called"])
})
