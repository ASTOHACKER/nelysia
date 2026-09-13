# Nelysia Ergonomic Shorthands Implementation Plan

**Goal**: Implement `context.html()`, `context.text()`, `context.json()`, `context.redirect()`, `context.header()`, `context.deleteCookie()`, and unified `app.listen(port, callback)` for v0.1.4.

---

### Task 1: Type Definitions (`packages/core/src/types.ts`)
- Add `ServerInfo` interface: `{ port: number; hostname: string; url: string; server: unknown }`
- Update `Context` interface with:
  - `html(body: string, status?: number): ResponseData`
  - `text(body: string, status?: number): ResponseData`
  - `json(body: unknown, status?: number): ResponseData`
  - `redirect(url: string, status?: number): ResponseData`
  - `header(name: string, value: string): this`
  - `deleteCookie(name: string, options?: CookieOptions): void`
- Update `listen()` signature on `Nelysia`

---

### Task 2: Core Context Helpers & Listen Implementation (`packages/core/src/app.ts`)
- In `createContext()`:
  - Add `html`, `text`, `json`, `redirect`, `header`, `deleteCookie` implementations
- In `listen()`:
  - Accept `port: number | { port: number; hostname?: string }` and `callback?: (info: ServerInfo) => void`
  - Bun: use `createCompiledBunHandler` and call callback with info
  - Node: call `server.listen(actualPort, hostname, () => { ... })` and invoke callback

---

### Task 3: Compiler Runtime Parity (`packages/compiler/src/index.ts`)
- Update `runGeneric` context object with matching helpers (`html`, `text`, `json`, `redirect`, `header`, `deleteCookie`)

---

### Task 4: Automated Testing (`tests/core.test.ts`)
- Add tests for `context.html`, `context.redirect`, `context.deleteCookie`, `context.header`
- Add test for `app.listen` with callback on Node and Bun

---

### Task 5: Build, Release v0.1.4, and Upgrade Demo App (`XX`)
- Bump version to `0.1.4` in `package.json`
- `npm run package:build`
- `npm test` & `bun test`
- Commit, tag `v0.1.4`, push, and publish GitHub release
- Upgrade `C:\Users\Computer_BSc\Desktop\XX`:
  - Simplify `src/app.ts` using `context.html`
  - Simplify `src/index.ts` to one-liner `app.listen(port, (info) => ...)`
  - Verify all tests pass and live server works
