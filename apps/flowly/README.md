# Flowly on Nelysia

New API layer for the Flowly project/task schema on PostgreSQL. The app creates
the required tables on startup when they do not exist. The database URL is read
from `DATABASE_URL` and must never be committed.

## Run

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require'
export FLOWLY_JWT_SECRET=local-development-secret
node --experimental-strip-types src/app.ts
```

Available documentation:

- `GET /health`
- `GET /openapi.json`
- `GET /swagger`

Protected routes require a JWT whose `sub` is an existing `users.id` and whose
`role` matches the user's role. The API uses the existing Nelysia plugins for
auth, roles, sessions, rate limiting, timeout handling, logging, caching,
health checks, uploads, CORS/security headers, and OpenAPI documentation.
