# AI SDK Example

`examples/ai-sdk/app.ts` shows the AI SDK `generateText` call inside a Nelysia route and exposes an injectable `createAiSdkApp(model)` helper.

The checked-in example uses `MockLanguageModelV3` from `ai/test`. It is deterministic, makes no network requests, and requires no credentials:

```bash
npm run ai:example
curl -X POST http://localhost:3001/ai \
  -H 'content-type: application/json' \
  -d '{"prompt":"Say hello"}'
```

Expected response:

```json
{"text":"Deterministic AI SDK response"}
```

For production, pass a provider model from an AI SDK provider package to `createAiSdkApp`. The example does not configure a provider, API key, streaming response, tool calling, or provider-specific options. Those concerns remain the responsibility of the application and provider integration.

Compatibility: the example targets AI SDK `7.x` and Node `22+`, matching this repository's current runtime requirements. The Fetch handler is also suitable for Fetch-based adapters such as the existing framework examples.
