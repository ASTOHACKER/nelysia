# JWT Example

This example demonstrates the Web Crypto-based JWT plugin with a protected
route. Configure a non-empty secret in application code or deployment secrets;
never commit production secrets. The plugin supports HS256 and validates
expiration and not-before claims on Node, Bun, and Web Crypto runtimes.

Run the repository JWT conformance tests with `npm test` or `bun test`.

Run the example server (requires `JWT_SECRET`, the app fail-fasts without it):

```bash
JWT_SECRET=dev-secret-change-me node --experimental-strip-types examples/jwt/index.ts
curl http://localhost:3000/sign/bob
curl http://localhost:3000/profile -H "Authorization: Bearer <token>"
```

See `.env.example` for the local variable. Never commit production secrets.
