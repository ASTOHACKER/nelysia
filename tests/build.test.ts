import assert from "node:assert/strict"
import test from "node:test"
import { compile, createGeneratedMatcher, generateBuildArtifact, generateMatcherSource, generateSerializerSource, generateValidatorSource, generateServerSource, generateStandaloneServerSource } from "../packages/compiler/src/index.ts"
import { Nelysia, t } from "../packages/core/src/index.ts"

test("generates runnable Bun and Node server entrypoints", () => {
  const bun = generateServerSource({ entry: "../examples/hello/app.ts", target: "bun" })
  const node = generateServerSource({ entry: "../examples/hello/app.ts", target: "node" })
  assert.match(bun, /createCompiledBunHandler/)
  assert.match(bun, /Bun\.serve/)
  assert.match(node, /createNodeServer/)
  assert.match(node, /\.listen\(port/)
})

test("build artifacts have target-specific names and a standalone diagnostic manifest", () => {
  const app = new Nelysia()
    .get("/health", "ok")
    .get("/users/:id", ({ params }) => ({ id: params.id }))
  const compiled = compile(app)
  const bun = generateBuildArtifact({ entry: "./app.ts", target: "bun", compiled })
  const node = generateBuildArtifact({ entry: "./app.ts", target: "node", compiled })

  assert.equal(bun.manifest.artifact, "server.bun.ts")
  assert.equal(node.manifest.artifact, "server.node.ts")
  assert.equal(bun.manifest.sourceToSource, false)
  assert.equal(bun.manifest.generation, "standalone")
  assert.equal(bun.manifest.target, "bun")
  assert.equal(bun.manifest.reproducible, true)
  assert.equal(bun.manifest.sourceMap, "server.bun.ts.map")
  assert.match(bun.sourceMap, /\"version\":3/)
  assert.equal(bun.manifest.cacheKey, node.manifest.cacheKey === bun.manifest.cacheKey ? "unexpected" : bun.manifest.cacheKey)
  assert.match(bun.source, /Bun\.serve/)
  assert.doesNotMatch(bun.source, /createNodeServer/)
  assert.match(node.source, /node:http/)
  assert.doesNotMatch(node.source, /createNodeServer|Bun\.serve/)
  assert.deepEqual(bun.manifest.diagnostics, [{
    code: "NELY001",
    severity: "info",
    message: "This artifact is a standalone server for the supported static and params-only GET subset; arbitrary source-to-source generation is not enabled."
  }])
})

test("generated matcher preserves static and parameter route semantics", () => {
  const app = new Nelysia().get("/users/:id", ({ params }) => params.id)
  const route = app.graph.routes[0]
  const matcher = createGeneratedMatcher(route)
  assert.deepEqual(matcher("/users/ada%2F1"), { id: "ada/1" })
  assert.equal(matcher("/other"), undefined)
  assert.match(generateMatcherSource(app.graph.routes), /matchGeneratedRoute/)
})

test("compiler emits validator and serializer source contracts", () => {
  const validator = generateValidatorSource(t.Object({ name: t.String() }))
  assert.match(validator, /validateGenerated/)
  assert.match(validator, /required/)
  assert.match(generateSerializerSource(), /serializeGenerated/)
  const validate = new Function(`${validator.replace("export function", "function")}\nreturn validateGenerated`)() as (value: unknown) => unknown
  assert.deepEqual(validate({ name: "Ada" }), { name: "Ada" })
  assert.throws(() => validate({ name: 1 }))
  const serialize = new Function(`${generateSerializerSource().replace("export function", "function")}\nreturn serializeGenerated`)() as (value: unknown) => string
  assert.equal(serialize({ ok: true }), '{"ok":true}')
})

test("generated validators and serializers stay behaviorally aligned with reference schemas", async () => {
  const cases = [
    { schema: t.String(), valid: "ok", invalid: 1 },
    { schema: t.Number(), valid: 42, invalid: "42" },
    { schema: t.Boolean(), valid: true, invalid: "true" },
    { schema: t.Object({ name: t.String(), age: t.Number() }), valid: { name: "Ada", age: 37 }, invalid: { name: "Ada", age: "37" } }
  ]
  for (const { schema, valid, invalid } of cases) {
    const generated = new Function(`${generateValidatorSource(schema).replace("export function", "function")}\nreturn validateGenerated`)() as (value: unknown) => unknown
    assert.deepEqual(generated(valid), await schema.validate(valid))
    assert.throws(() => generated(invalid))
    await assert.rejects(async () => await schema.validate(invalid))
  }
  const serializer = new Function(`${generateSerializerSource().replace("export function", "function")}\nreturn serializeGenerated`)() as (value: unknown) => string
  for (const value of [{ ok: true }, ["a", 1], "text"]) assert.equal(serializer(value), JSON.stringify(value))
})

test("static-only builds emit a standalone handler without the generic router", () => {
  const app = new Nelysia().get("/", { ok: true }).get("/users/:id", ({ params }) => ({ id: params.id }))
  const source = generateStandaloneServerSource({ entry: "./app.ts", target: "bun", compiled: compile(app) })
  assert.ok(source)
  assert.doesNotMatch(source, /createCompiledBunHandler|createNodeServer/)
  assert.match(source, /const routes/)
})

test("generated standalone handlers execute static and params-only routes", async () => {
  const app = new Nelysia().get("/", "ok").get("/users/:id", ({ params }) => ({ id: params.id }))
  const source = generateBuildArtifact({ entry: "./app.ts", target: "bun", compiled: compile(app) }).source
  assert.doesNotMatch(source, /from ["']\.\.\/packages\/(compiler|runtime)/)
  assert.match(source, /export const handle/)
  assert.match(source, /content-type/)
})

test("unsupported routes select adapter generation with an explicit diagnostic", () => {
  const compiled = compile(new Nelysia().post("/users", ({ body }) => body))
  const artifact = generateBuildArtifact({ entry: "./app.ts", target: "node", compiled })
  assert.equal(artifact.manifest.generation, "adapter")
  assert.deepEqual(artifact.manifest.diagnostics[1], {
    code: "NELY002",
    severity: "warning",
    message: "Standalone generation unsupported: Only GET static and params-only routes are standalone",
    route: { method: "POST", path: "/users" }
  })
  assert.match(artifact.source, /createNodeServer/)
})

test("adapter artifacts record dispatcher coverage", () => {
  const app = new Nelysia()
    .getStatic("/json", { ok: true })
    .post("/users", ({ body }) => body)
  const artifact = generateBuildArtifact({ entry: "./app.ts", target: "node", compiled: compile(app) })
  assert.equal(artifact.manifest.dispatcher, true)
  assert.deepEqual(artifact.manifest.diagnostics.at(-1), {
    code: "NELY003",
    severity: "info",
    message: "Compiled dispatcher fast path covers 1 of 2 routes; 1 use the generic fallback.",
  })
  const standalone = generateBuildArtifact({
    entry: "./app.ts",
    target: "node",
    compiled: compile(new Nelysia().getStatic("/json", { ok: true })),
  })
  assert.equal(standalone.manifest.dispatcher, false)
  assert.ok(!standalone.manifest.diagnostics.some((diagnostic) => diagnostic.code === "NELY003"))
})
