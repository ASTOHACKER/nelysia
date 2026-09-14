# Nelysia Development Plan

This document preserves the original development boundaries. The current
implementation and release evidence are tracked in
[`docs/release-status.md`](./release-status.md) and
[`docs/v0.5-release-gates.md`](./v0.5-release-gates.md); the v0.5.1 package has
already completed the historical next gates below except for the intentionally
deferred 24-hour soak and npm publication.

## Current strategy

Nelysia is developed in this order:

1. Define observable execution semantics.
2. Implement one reference runtime.
3. Add a conservative compiler boundary.
4. Verify compiled behavior against the reference runtime.
5. Measure each optimization independently.

The compiler never guesses. If a handler, hook, or registration pattern cannot be analyzed safely, it remains on the generic path.

## Release boundary

The first implementation ends at the v0.1 Definition of Done in `docs/v0.1-definition-of-done.md`. WebSockets, deployment integrations, full route type generation, PGO, and standalone source-to-source generation are v0.2 work. This boundary prevents the project from becoming an unfinishable feature checklist.

## First checkpoint

The first vertical slice must support `GET /` and `GET /users/:id` from one application definition, on the reference and compiled paths. It must preserve status, headers, body, route parameters, hook order, and thrown errors.

## Compiler boundary

The MVP compiler receives an already-registered application graph. It does not execute arbitrary application source during build and does not call `listen()`. Static source discovery and generated code are later phases.

The compiler may specialize only facts proven by the graph:

- static routes can use a static route metadata flag
- parameter routes expose only their declared parameters
- opaque handlers and hooks use the generic execution path

No hook is removed based only on whether its return value is consumed. Side effects, early responses, errors, and ordering are part of the contract.

The post-v0.5.1 continuation is maintained in
[`docs/roadmap-after-v051.md`](./roadmap-after-v051.md). It uses the public
execution labels `COMPILED`, `SPECIALIZED`, and `GENERIC`, keeps unsupported
behavior on the generic fallback, and stages 1M/10M/30m/1h/6h evidence before
the separately deferred 24-hour soak.

## Next gates

- Add schema contracts and validation parity.
- Add HTTP conformance cases for headers, malformed URLs, body limits, and shutdown.
- Add generated Node output and a real Bun adapter test on a Bun runner.
- Add benchmarks only after the above behavior is stable.
