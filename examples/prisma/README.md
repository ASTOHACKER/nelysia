# Prisma SQLite Example

This is a runnable Node integration example. The route uses the generated
Prisma client to query a SQLite `User` model through `prismaRoute`.

Run the complete workflow from the repository root:

```sh
npm run prisma:smoke
```

The command generates `@prisma/client`, creates the schema in a temporary
SQLite database with `prisma db push`, and runs the Node smoke test. The
database is written to `examples/prisma/smoke.db`; it is ignored by the
repository configuration and can be removed after the test.

For application code, run `npm run prisma:generate` after changing
`schema.prisma`, then import `PrismaClient` from `@prisma/client` as shown in
`route.ts`.
