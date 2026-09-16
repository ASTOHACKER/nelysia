# Typed Client Example

`client.ts` builds a `createClient<typeof app>()` client with a stubbed `fetch`,
so it runs without a server:

```bash
node --experimental-strip-types examples/typed-client/client.ts
# or: npm run example:typed-client
```

In your own project, replace the type import with your app:

```ts
import type { app } from "./app" // your app, not this repo's hello example
const client = createClient<typeof app>("https://api.example.com")
```
