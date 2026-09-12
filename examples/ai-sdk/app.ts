import { generateText, type LanguageModel } from "ai"
import { MockLanguageModelV3 } from "ai/test"
import { Nelysia } from "../../packages/core/src/index.ts"
import { createFetchHandler } from "../../packages/runtime-fetch/src/server.ts"

export const mockModel = new MockLanguageModelV3({
  provider: "nelysia-example",
  modelId: "deterministic-model",
  doGenerate: async () => ({
    content: [{ type: "text", text: "Deterministic AI SDK response" }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 4, text: 4, reasoning: 0 }
    },
    warnings: []
  })
})

export function createAiSdkApp(model: LanguageModel): Nelysia {
  return new Nelysia().post("/ai", async ({ body, response }) => {
    if (!body || typeof body !== "object" || typeof (body as { prompt?: unknown }).prompt !== "string") {
      return response(400, { error: "Expected a JSON body with a string prompt" })
    }

    const { text } = await generateText({
      model,
      prompt: (body as { prompt: string }).prompt
    })

    return { text }
  })
}

export const app = createAiSdkApp(mockModel)
export const fetchHandler = createFetchHandler(app)
