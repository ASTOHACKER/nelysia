# Nelysia v0.1.2 DX & Engine Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement ergonomic developer experience improvements (`query` destructuring proxy, `set.status`), error status preservation, `staticDirectory` plugin, and OpenAPI enhancements for Nelysia v0.1.2.

**Architecture:** Extend `Context` with proxy-based query access and a mutable response `set` context, add safe directory traversal static file serving to plugins, enhance schema definition extraction in OpenAPI, and maintain 100% backward compatibility across all runtimes.

**Tech Stack:** TypeScript, Node.js 22+, Bun, StandardSchema, OpenAPI 3.1.

## Global Constraints
- Zero breaking changes to existing `Nelysia` APIs.
- All 59 existing core/integration tests must continue passing.
- TypeScript typecheck (`npm run typecheck`) must pass with zero errors.
- Package build (`npm run package:build`) must succeed cleanly.

---

### Task 1: Ergonomic `context.query` Proxy

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/app.ts`
- Test: `tests/core.test.ts`

**Interfaces:**
- Produces: `export type ParsedQuery = URLSearchParams & Record<string, string | undefined>` on `Context.query`.

- [ ] **Step 1: Write the failing test**
Add test in `tests/core.test.ts` asserting `query.name` and `const { name } = query` work on context while `query.get("name")` still functions.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL because property access on URLSearchParams returns undefined or method.

- [ ] **Step 3: Implement minimal code**
In `packages/core/src/app.ts`, create `createParsedQuery(search: string): ParsedQuery` using Proxy over `URLSearchParams`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**
`git add packages/core/src/app.ts packages/core/src/types.ts tests/core.test.ts && git commit -m "feat(core): support object property access on context.query via proxy"`

---

### Task 2: Ergonomic `context.set` (`set.status`, `set.headers`)

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/app.ts`
- Test: `tests/core.test.ts`

**Interfaces:**
- Produces: `set: { status?: number; headers: Record<string, string> }` on `Context`.

- [ ] **Step 1: Write the failing test**
Add test where handler sets `set.status = 201; set.headers["x-custom"] = "val"; return { ok: true }`.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL (`set` undefined or status 200).

- [ ] **Step 3: Implement minimal code**
Update `Context` initialization in `app.ts` to include `set`, and when creating response, use `context.set.status ?? 200` and merge `context.set.headers`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**
`git add packages/core/src/app.ts packages/core/src/types.ts tests/core.test.ts && git commit -m "feat(core): add context.set for status and header manipulation"`

---

### Task 3: Automatic `HttpError` Status Mapping

**Files:**
- Modify: `packages/core/src/app.ts`
- Test: `tests/core.test.ts`

- [ ] **Step 1: Write the failing test**
Add test where validation throws `HttpError(400)` and error handler returns plain object `{ error: err.message }` without explicit response helper.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL (returns 200 or 500).

- [ ] **Step 3: Implement minimal code**
In `app.ts` catch block, set `context.set.status = errorStatus` and wrap user handler results with `errorStatus`.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**
`git add packages/core/src/app.ts tests/core.test.ts && git commit -m "feat(core): preserve HttpError status in error pipeline"`

---

### Task 4: `staticDirectory` Plugin

**Files:**
- Modify: `packages/plugins/src/index.ts`
- Test: `tests/core.test.ts`

**Interfaces:**
- Produces: `export function staticDirectory(options: StaticDirectoryOptions): (app: Nelysia) => Nelysia`

- [ ] **Step 1: Write the failing test**
Add test serving a temporary directory with files and subdirectory, verifying index resolution, mime types, and traversal security.

- [ ] **Step 2: Run test to verify it fails**
Run: `npm test`
Expected: FAIL (`staticDirectory` not exported).

- [ ] **Step 3: Implement minimal code**
Implement `staticDirectory` in `packages/plugins/src/index.ts` using `node:fs/promises`, `node:path`, path normalization, and mime detection.

- [ ] **Step 4: Run test to verify it passes**
Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**
`git add packages/plugins/src/index.ts tests/core.test.ts && git commit -m "feat(plugins): add staticDirectory plugin"`

---

### Task 5: OpenAPI StandardSchema Inspection

**Files:**
- Modify: `packages/openapi/src/index.ts`
- Test: `tests/core.test.ts`

- [ ] **Step 1: Write test**
Verify OpenAPI document reflects properties for routes using schema definitions.

- [ ] **Step 2: Implement enhancement**
Inspect schema properties safely in `definition(schema)`.

- [ ] **Step 3: Run test**
Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**
`git add packages/openapi/src/index.ts tests/core.test.ts && git commit -m "feat(openapi): improve schema inspection"`

---

### Task 6: Bump Version to 0.1.2 & Build Release Assets

**Files:**
- Modify: `package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/compiler/package.json`
- Modify: `packages/openapi/package.json`
- Modify: `packages/plugins/package.json`
- Modify: `packages/observability/package.json`
- Modify: `packages/runtime-fetch/package.json`
- Modify: `packages/runtime-node/package.json`
- Modify: `packages/cli/package.json`

- [ ] **Step 1: Update version strings to 0.1.2**
- [ ] **Step 2: Run typecheck**
Run: `npm run typecheck`
- [ ] **Step 3: Build distribution package**
Run: `npm run package:build`
- [ ] **Step 4: Run full test suite**
Run: `npm test && bun test`
- [ ] **Step 5: Commit & push**
`git commit -m "chore(release): bump version to 0.1.2 and rebuild packages"`
