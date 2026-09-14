import { createClient } from "../../packages/client/src/index.ts"
import type { app } from "../hello/app.ts"

// `typeof app` supplies the route map to the client without importing the
// server at runtime. The stub keeps this example executable without a server.
const client = createClient<typeof app>("https://api.example.test", {
  fetch: async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" }
  })
})

const result = await client.get("/")
console.log(result.data)
