import assert from "node:assert/strict"
import test from "node:test"
import { Nelysia } from "../packages/core/src/index.ts"

test("handles concurrent requests without cross-request state leakage", async () => {
  const app = new Nelysia().get("/item/:id", ({ params, query, requestId }) => ({ id: params.id, value: query.get("value"), requestId }))
  const responses = await Promise.all(Array.from({ length: 200 }, (_, index) => app.inject({
    method: "GET",
    path: `/item/${index}?value=${index}`,
    headers: { "x-request-id": `concurrent-${index}` }
  })))
  assert.equal(responses.length, 200)
  for (const [index, response] of responses.entries()) {
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { id: String(index), value: String(index), requestId: `concurrent-${index}` })
  }
})

test("request ID policy is deterministic across enabled and disabled applications", async () => {
  const enabled = new Nelysia().get("/", ({ requestId }) => requestId)
  const disabled = new Nelysia({ requestId: false }).get("/", ({ requestId }) => requestId)
  const [enabledResponse, disabledResponse] = await Promise.all([
    enabled.inject({ method: "GET", path: "/" }),
    disabled.inject({ method: "GET", path: "/" })
  ])
  assert.match(String(await enabledResponse.text()), /^req-/)
  assert.equal(await disabledResponse.text(), "")
  assert.ok(enabledResponse.headers.get("x-request-id"))
  assert.equal(disabledResponse.headers.get("x-request-id"), null)
})
