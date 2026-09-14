# JWT Example

This example demonstrates the Web Crypto-based JWT plugin with a protected
route. Configure a non-empty secret in application code or deployment secrets;
never commit production secrets. The plugin supports HS256 and validates
expiration and not-before claims on Node, Bun, and Web Crypto runtimes.

Run the repository JWT conformance tests with `npm test` or `bun test`.
