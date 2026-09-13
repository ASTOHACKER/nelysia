# Nelysia Production Completeness Implementation Plan

**Goal**: Implement and verify seven production-grade features in `@narudom96/nelysia`: `context.store`, `app.group()`, `app.notFound()`, `cors()`, `securityHeaders()`, `swaggerUi()`, and OpenAPI route metadata (`summary`, `description`, `tags`).

---

### Task 1: Context State Store (`context.store`)
- **Files**:
  - `packages/core/src/types.ts`: Add `store: Record<string, unknown>` to `Context`
  - `packages/core/src/app.ts`: Initialize `store: {}` in `handle()`
  - `packages/compiler/src/index.ts`: Initialize `store: {}` in generic dispatcher
  - `tests/core.test.ts`: Add test verifying middleware mutation and handler access
- **Verification**: `npm test -- --test-name-pattern="context.store"`

---

### Task 2: Route Grouping (`app.group`) and Hook Inheritance
- **Files**:
  - `packages/core/src/app.ts`:
    - Add `group(prefix: string, callback: (app: Nelysia) => void): this`
    - Update `mount()` to inherit parent's `this.hooks`, `this.afterHooks`, and `this.errorHandlers`
  - `tests/core.test.ts`: Add test verifying nested route grouping, prefix prepending, and hook inheritance
- **Verification**: `npm test -- --test-name-pattern="group"`

---

### Task 3: Custom Not Found Handler (`app.notFound`)
- **Files**:
  - `packages/core/src/app.ts`:
    - Add `private notFoundHandler?: Handler`
    - Add `notFound(handler: Handler): this`
    - In `handle()`, invoke `this.notFoundHandler` when no route matches (status defaults to 404)
  - `tests/core.test.ts`: Add test verifying custom 404 response payload and status
- **Verification**: `npm test -- --test-name-pattern="notFound"`

---

### Task 4: CORS Plugin (`cors`) & Preflight Handling
- **Files**:
  - `packages/core/src/app.ts`:
    - Allow preflight `OPTIONS` requests with `Origin` header to execute hooks so CORS headers and status are returned
  - `packages/plugins/src/index.ts`:
    - Add `cors(options?: CorsOptions)` supporting `origin`, `methods`, `allowedHeaders`, `exposedHeaders`, `credentials`, and `maxAge`
  - `tests/core.test.ts`: Add tests for CORS preflight `OPTIONS` and standard cross-origin `GET`
- **Verification**: `npm test -- --test-name-pattern="cors"`

---

### Task 5: Security Headers Plugin (`securityHeaders`)
- **Files**:
  - `packages/plugins/src/index.ts`:
    - Add `securityHeaders(options?: SecurityHeadersOptions)` applying `x-content-type-options`, `x-frame-options`, `referrer-policy`, `strict-transport-security`, etc.
  - `tests/core.test.ts`: Add test checking presence and values of security headers on responses
- **Verification**: `npm test -- --test-name-pattern="securityHeaders"`

---

### Task 6: Swagger UI & OpenAPI Route Metadata
- **Files**:
  - `packages/core/src/types.ts`: Add `summary?: string`, `description?: string`, `tags?: string[]` to `RouteOptions` and `RouteRecord`
  - `packages/core/src/app.ts`: Store metadata in `route()`
  - `packages/openapi/src/index.ts`:
    - Map `summary`, `description`, `tags` in `generateOpenAPI`
    - Add `swaggerUi(options?: SwaggerUiOptions)`
  - `tests/core.test.ts`: Add test verifying OpenAPI metadata extraction and Swagger UI HTML serving
- **Verification**: `npm test -- --test-name-pattern="swagger"`

---

### Task 7: Full Verification, Package Build, and Version Release
- **Files**:
  - `package.json`: Bump version to `0.1.3`
- **Commands**:
  - `npm test` (all tests passing on Node.js 22+)
  - `bun test` (all tests passing on Bun)
  - `npm run typecheck` (0 errors)
  - `npm run package:build`
  - Git commit and push
