# Deno Fetch Example

`main.ts` is a Deno entrypoint using only the Web Fetch `Request`/`Response`
contract and `Deno.serve`. Verify it with `npm run deno:check`, or run it with:

```sh
deno run --allow-net examples/deno/main.ts
```

The example does not import Node adapters or use Bun globals. Deno runtime
version compatibility follows the Web APIs exposed by the selected Deno
release.
