# Build Manifest Contract

The v0.3 build produces two files in `dist/`:

- `server.bun.ts` or `server.node.ts`, a target-specific server entrypoint;
- `server.bun.ts.map` or `server.node.ts.map`, a source-map artifact for the generated wrapper;
- `manifest.json`, a standalone description of that artifact.

The manifest has `version: 1`, identifies the `target` and `artifact`, records the source `entry`, and includes the compiler's route analyses. `sourceToSource` is `true` only when every route is safely embeddable by the declared standalone subset; otherwise it is `false` and `generation` is `adapter`. Standalone artifacts embed supported static, parameter, and schema-aware routes without importing the development router. Adapter artifacts retain the application entry and selected runtime adapter. Unsupported closures, platform-dependent handlers, WebSockets, and application-level runtime features always use the adapter fallback with diagnostics.

Diagnostics are stable objects with `code`, `severity`, and `message`. A `NELY001` info diagnostic documents the supported standalone boundary. A `NELY002` warning is emitted for each route unsupported by standalone generation and includes its method and path.

Consumers should treat unknown manifest fields as forward-compatible additions and should not infer generated route code from a compiled route analysis. The manifest is the contract for build status and limitations; it is safe to consume without importing the application.
