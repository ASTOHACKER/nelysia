# Nelysia TypeBox-Compatible Schema Design

## Status

Proposed design for review. This document defines the compatibility target and
the implementation boundary; it is not a claim that the current package
already implements the target.

## Goal

Make Nelysia's native `t` schema API a reliable TypeBox-compatible runtime
schema layer for HTTP request and response validation, while preserving the
existing Nelysia public route API and adapter behavior.

The compatibility target is the installed `typebox@1.3.30` contract and the
schema usage expected by the installed Elysia `2.0.0-exp.60` dependency. The
target is version-pinned so future TypeBox changes can be evaluated as an
explicit compatibility update rather than silently changing Nelysia behavior.

## Scope

### Runtime schema surface

The native `t` API will cover the runtime schema constructors useful for an API
framework:

- primitives: `Any`, `Unknown`, `Never`, `Null`, `Boolean`, `String`, `Number`,
  `Integer`, `BigInt`, and `Date`;
- structures: `Object`, `Array`, `Tuple`, `Record`, `Enum`, `Literal`, and
  `TemplateLiteral` where a deterministic runtime validator can be produced;
- composition: `Union`, `Intersect`, `Nullable`, and `Optional`;
- object transformations: `Partial`, `Required`, `Pick`, `Omit`, `Readonly`,
  and `Composite`;
- references: stable `$id`/`$ref` definitions and bounded recursive schemas;
- TypeBox-compatible metadata and validation options, including numeric,
  string, array, object, tuple, format, default, examples, and annotation
  fields.

TypeBox's compile-time-only type algebra for functions, constructors,
conditional type actions, and similar non-JSON runtime values is explicitly
outside the HTTP validation contract. Those types may be represented as
unsupported schemas with a documented fallback, but they will not be claimed
as runtime validation features.

### Compatibility invariants

- Existing zero-argument constructors remain valid.
- Existing `Schema`, `RouteRecord`, `handle()`, `preflight()`, and adapter
  signatures remain compatible.
- No TypeBox runtime dependency is added to the published package.
- Generic and generated validation have the same accepted values, transformed
  output, error status, and error path.
- Unsupported schema features fall back to the reference validator with a
  deterministic diagnostic; they never silently skip validation.
- Existing safe-key handling for `__proto__`, `constructor`, and `prototype`
  remains enforced.

## Architecture

### Canonical schema IR

Add a private normalized schema IR used by the core, compiler, and OpenAPI
packages. The IR will retain the public `Schema.definition` JSON-compatible
shape for compatibility, but construction and validation will use normalized
nodes so every consumer sees the same semantics.

Each node contains:

- a stable kind and JSON Schema/OpenAPI definition;
- child nodes and reference identities;
- normalized options with invalid combinations rejected at construction;
- a validation capability classification: `compiled`, `reference`, or
  `unsupported`;
- a deterministic stable hash for validator and plan caches.

The IR will be immutable after construction. Schema transformations create new
nodes and preserve source metadata where the target contract permits it.

### Shared validation engine

Move validation rules into one internal evaluator that operates on the IR. The
reference path calls this evaluator directly. The compiler emits the same
operation semantics into generated validators rather than maintaining a second
hand-written rule set.

The evaluator will cover:

- primitive type checks and integer/finite-number rules;
- numeric bounds, exclusivity, `multipleOf`, and safe floating-point handling;
- string length, pattern, and registered formats;
- arrays, tuples, item limits, uniqueness, and nested validation;
- objects, required keys, property limits, additional properties, and nested
  schemas;
- unions, intersections, nullable/optional values, literals, enums, and
  reference resolution;
- output shaping and safe-property assignment consistent with the current
  Nelysia behavior;
- stable `HttpError` status and path messages.

The format registry will initially include `date`, `date-time`, `email`,
`uuid`, `url`, `uri`, `ipv4`, `ipv6`, and `hostname`. Unknown custom formats
remain annotations unless a user-registered format validator is explicitly
provided.

### Compiler and AOT behavior

The compiler will lower supported IR nodes to a compact validation operation
table and emit a validator from that table. The generated dispatcher and
standalone artifacts will support the same keyword matrix as the reference
evaluator.

Schemas containing unsupported dynamic references, custom validators, or
non-JSON runtime values use the generic/reference path. Diagnostics identify
the first unsupported node and keyword. No runtime `eval` or `new Function` is
used on user-provided schema source.

Validator caches are keyed by the IR hash and compiler/runtime capability
version. Cache invalidation occurs when a schema, format registry, provider,
or compiler capability version changes.

### OpenAPI and JSON Schema

OpenAPI generation consumes the canonical IR rather than inspecting individual
constructor objects. The implementation will support the OpenAPI 3.1 / JSON
Schema 2020-12-compatible subset used by the runtime, including:

- `$id`, `$ref`, and reusable components;
- descriptions, titles, defaults, examples, read/write annotations;
- numeric, string, array, object, tuple, enum, union, and intersection rules;
- `additionalProperties` as a boolean or nested schema;
- stable output ordering for snapshots and documentation.

When OpenAPI cannot express a runtime-only behavior exactly, the generated
document will preserve the JSON Schema annotation and the docs will identify
the limitation.

## Public API design

All supported constructors accept an optional options object matching the
relevant TypeBox option family. Existing Nelysia-specific aliases remain
available. Options are validated at construction time where invalid values
would otherwise create an ambiguous schema, for example negative lengths,
non-positive `multipleOf`, or contradictory bounds.

Representative target usage:

```ts
const User = t.Object({
  id: t.Integer({ minimum: 1 }),
  email: t.String({ format: "email" }),
  tags: t.Array(t.String({ minLength: 1 }), { uniqueItems: true })
}, { additionalProperties: false })
```

Type inference must preserve the value type independently of runtime options.
Options narrow validation behavior and OpenAPI output; they do not turn a
`number` into a new TypeScript value type unless a constructor such as
`Integer` has an explicit value-domain distinction.

## Testing strategy

### Type-level tests

- every supported constructor and option family compiles;
- nested and transformed schemas infer the expected route body/response types;
- invalid option shapes fail with useful TypeScript diagnostics;
- package consumer tests import the public types from the packed artifact.

### Differential runtime tests

For each schema family, compare:

- reference validation;
- generated validator validation;
- Bun, Node, and Fetch adapter responses;
- request and response validation;
- normalized output, status, error path, and error message class.

### Fuzz and edge cases

- boundary values for every numeric/string/array/object limit;
- Unicode strings, regular expressions, malformed URLs, and invalid dates;
- duplicate primitive and object array entries;
- prototype-pollution keys;
- cyclic/reference schemas and deeply nested unions;
- malformed options and conflicting constraints.

### Documentation and release checks

- add a schema compatibility matrix and Elysia migration examples;
- keep historical benchmark numbers unchanged;
- add schema validator overhead and AOT fallback evidence;
- require `typecheck`, Node/Bun tests, package build/imports, OpenAPI snapshots,
  framework fixtures, and docs checks before release;
- do not claim full TypeBox/Elysia parity until the pinned matrix passes.

## Milestones

1. **IR and constructor contract:** normalize existing schemas, add missing
   primitive/structure options, and preserve current behavior.
2. **Shared evaluator:** migrate generic validation and add complete constraint
   and format tests.
3. **Compiler parity:** lower the IR to generated validators and close every
   generic/AOT differential failure.
4. **References and OpenAPI:** add `$id`/`$ref`, recursive bounds, reusable
   components, and stable OpenAPI 3.1 output.
5. **Advanced runtime types:** add the remaining JSON-compatible TypeBox
   constructors and transformations, then document unsupported non-JSON types.
6. **Performance and release gate:** benchmark validation cost, memory, and
   fallback rates across Bun, Node, and Fetch before deciding release status.

Each milestone must leave the repository type-safe and testable. A later
milestone may not weaken the reference path or change existing route semantics
to make a compiler benchmark pass.

## Non-goals

- Adding a breaking public API change.
- Shipping TypeBox as a runtime dependency solely to avoid implementing the
  Nelysia contract.
- Claiming universal support for arbitrary user-defined JavaScript validators.
- Changing route execution, mounts, WebSockets, auth, or response semantics
  outside the schema validation boundary.
- Declaring production readiness or performance victory before the existing Win
  Matrix gates pass.

## Acceptance criteria

The project can claim the pinned compatibility milestone only when:

- all in-scope constructors/options have type, runtime, AOT, and OpenAPI tests;
- generic and generated validators agree for the full supported keyword matrix;
- all adapters pass correctness and error-contract differential tests;
- unsupported features produce documented fail-closed fallback diagnostics;
- package, docs, and migration checks pass;
- no existing test or public route contract regresses.
