# Integrations Smoke (internal)

`smoke.ts` is a **repository-internal** smoke test for the Drizzle, Better Auth,
and GraphQL integrations (in-memory fakes, no real DB). It is not a
copy-paste template for consumers.

Run from the repo root only:

```bash
npm run integrations:smoke
```

Consumer usage is documented in `docs/DOCUMENTATION_EN.md` (Drizzle & Prisma,
Better Auth, GraphQL sections) and the runnable `examples/prisma/` example.
