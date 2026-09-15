import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { compile, createGeneratedMatcher, generateBuildArtifact, generateMatcherSource, generateSerializerSource, generateValidatorSource, generateServerSource, generateStandaloneServerSource, unsupportedRouteDiagnostic } from "../packages/compiler/src/index.ts"
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
  assert.equal(bun.manifest.sourceToSource, true)
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
    message: "This artifact is a standalone source-to-source server for the routes whose handlers and schemas can be embedded safely."
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

test("generated matcher supports wildcard route parameters", () => {
  const app = new Nelysia().get("/assets/*", ({ params }) => params["*"])
  const matcher = createGeneratedMatcher(app.graph.routes[0])
  assert.deepEqual(matcher("/assets/css/app.css"), { "*": "css/app.css" })
  assert.deepEqual(matcher("/assets"), { "*": "" })
  assert.match(generateMatcherSource(app.graph.routes), /pattern\.at\(-1\) === "\*"/)
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

test("generated validators preserve nested, union, nullable, enum, and tuple rules", () => {
  const schema = t.Object({
    name: t.String(),
    age: t.Optional(t.Number()),
    kind: t.Union([t.Literal("admin"), t.Literal("user")]),
    note: t.Nullable(t.String()),
    values: t.Array(t.Number())
  })
  const validate = new Function(`${generateValidatorSource(schema).replace("export function", "function")}\nreturn validateGenerated`)() as (value: unknown) => unknown
  assert.deepEqual(validate({ name: "Ada", kind: "admin", note: null, values: [1, 2] }), { name: "Ada", kind: "admin", note: null, values: [1, 2] })
  assert.throws(() => validate({ name: "Ada", kind: "guest", note: null, values: [1] }), /allowed value|match/)
  assert.throws(() => validate({ name: "Ada", kind: "user", note: 1, values: [1] }), /string/)
  assert.throws(() => validate({ name: "Ada", kind: "user", note: null, values: ["1"] }), /number/)
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
  const compiled = compile(new Nelysia().get("/users", () => "private", { auth: true }))
  const artifact = generateBuildArtifact({ entry: "./app.ts", target: "node", compiled })
  assert.equal(artifact.manifest.generation, "adapter")
  assert.deepEqual(artifact.manifest.diagnostics[1], {
    code: "NELY107",
    severity: "warning",
    message: "Standalone generation unsupported: Mounted or authenticated route metadata requires the generic runtime",
    route: { method: "GET", path: "/users" },
    field: "auth"
  })
  assert.match(artifact.source, /createNodeServer/)
})

test("classifies standalone exclusions with stable diagnostic codes", () => {
  const requestHook = new Nelysia().onRequest(() => {}).get("/request", "ok").graph.routes[0]
  const responseHook = new Nelysia().mapResponse((_context, response) => response.body).get("/response", "ok").graph.routes[0]
  const schema = new Nelysia().get("/schema", () => "ok", { response: t.String() }).graph.routes[0]
  const routeHook = new Nelysia().onBeforeHandle(() => {}).get("/hook", "ok").graph.routes[0]
  const opaque = new Nelysia().get("/opaque", ({ query }) => query.get("value")).graph.routes[0]

  assert.equal(unsupportedRouteDiagnostic(requestHook).code, "NELY102")
  assert.equal(unsupportedRouteDiagnostic(responseHook).code, "NELY103")
  // Deterministic built-in schemas are standalone-capable; the direct helper
  // therefore falls through to the handler diagnostic instead of labelling a
  // supported schema as a generic-only exclusion.
  assert.equal(unsupportedRouteDiagnostic(schema).code, "NELY105")
  assert.equal(unsupportedRouteDiagnostic(routeHook).code, "NELY106")
  assert.equal(unsupportedRouteDiagnostic(opaque).code, "NELY105")
})

test("adapter artifacts record dispatcher coverage", () => {
  const app = new Nelysia()
    .getStatic("/json", { ok: true })
    .get("/users", () => "private", { auth: true })
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

test("standalone generation embeds supported methods and schema validators", () => {
  const app = new Nelysia()
    .post("/echo", ({ body }) => body, { body: t.String(), response: t.String() })
    .get("/users/:id", ({ params }) => ({ id: params.id }))
    .get("/created", ({ response }) => response({ id: "order-1" }, { status: 201, headers: { "x-test": "yes" } }))
  const artifact = generateBuildArtifact({ entry: "./app.ts", target: "bun", compiled: compile(app) })
  assert.equal(artifact.manifest.generation, "standalone")
  assert.equal(artifact.manifest.sourceToSource, true)
  assert.match(artifact.source, /method: "POST"/)
  assert.match(artifact.source, /bodySchema/)
  assert.match(artifact.source, /Malformed JSON body/)
  assert.doesNotMatch(artifact.source, /createCompiledBunHandler|createNodeServer/)
})

test("standalone generation emits status-specific response validators", () => {
  const app = new Nelysia().get("/created", ({ response }) => response(201, { id: "order-1" }), {
    response: { 201: t.Object({ id: t.String() }) }
  })
  const artifact = generateBuildArtifact({ entry: "./app.ts", target: "bun", compiled: compile(app) })
  assert.match(artifact.source, /responseSchemas/)
  assert.match(artifact.source, /201/)
  assert.ok(artifact.manifest.diagnostics.some((diagnostic) => diagnostic.code === "NELY002"))
})

test("compiler keeps application-level runtime features on the adapter path", () => {
  const telemetry = generateBuildArtifact({
    entry: "./app.ts",
    target: "node",
    compiled: compile(new Nelysia({ telemetry: { onRequest() {} } }).get("/health", () => "ok"))
  })
  assert.equal(telemetry.manifest.generation, "adapter")
  assert.equal(telemetry.manifest.sourceToSource, false)
  assert.equal(telemetry.manifest.diagnostics.find((diagnostic) => diagnostic.code === "NELY111")?.code, "NELY111")

  const websocketApp = new Nelysia().websocket("/events", {})
  const websocket = generateBuildArtifact({ entry: "./app.ts", target: "bun", compiled: compile(websocketApp) })
  assert.equal(websocket.manifest.diagnostics.find((diagnostic) => diagnostic.code === "NELY110")?.code, "NELY110")
})

test("compiler falls back instead of embedding handlers with runtime closures", () => {
  const secret = process.env.NELYSIA_CLOSURE_SECRET ?? "outside"
  const artifact = generateBuildArtifact({
    entry: "./app.ts",
    target: "bun",
    compiled: compile(new Nelysia().get("/closed", () => secret))
  })
  assert.equal(artifact.manifest.generation, "adapter")
  assert.equal(artifact.manifest.diagnostics.find((diagnostic) => diagnostic.code === "NELY105")?.code, "NELY105")
})

test("generated Node standalone artifacts preserve HTTP request bodies", async () => {
  const app = new Nelysia()
    .post("/echo", ({ body }) => body, { body: t.String(), response: t.String() })
    .get("/users/:id", ({ params }) => ({ id: params.id }))
    .get("/created", ({ response }) => response({ id: "order-1" }, { status: 201, headers: { "x-test": "yes" } }))
    .options("/created", () => new Response("custom-options", { status: 202, headers: { allow: "custom" } }))
  const artifact = generateBuildArtifact({ entry: "./generated-entry.ts", target: "node", compiled: compile(app) })
  const directory = await mkdtemp(join(tmpdir(), "nelysia-generated-"))
  const file = join(directory, "server.ts")
  const port = 38000 + Math.floor(Math.random() * 1000)
  await writeFile(file, artifact.source)
  const child = spawn(process.execPath, ["--experimental-strip-types", file], { env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] })
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("generated server did not start")), 5000)
      child.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("standalone Node server listening")) { clearTimeout(timer); resolve() }
      })
      child.once("error", (error) => { clearTimeout(timer); reject(error) })
      child.once("exit", (code) => { if (code !== 0) { clearTimeout(timer); reject(new Error(`generated server exited with ${code}`)) } })
    })
    const get = await fetch(`http://127.0.0.1:${port}/users/ada`)
    assert.deepEqual(await get.json(), { id: "ada" })
    const post = await fetch(`http://127.0.0.1:${port}/echo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify("hello") })
    assert.equal(await post.text(), "hello")
    const created = await fetch(`http://127.0.0.1:${port}/created`)
    assert.equal(created.status, 201)
    assert.equal(created.headers.get("x-test"), "yes")
    assert.deepEqual(await created.json(), { id: "order-1" })
    const explicitOptions = await fetch(`http://127.0.0.1:${port}/created`, { method: "OPTIONS" })
    assert.equal(explicitOptions.status, 202)
    assert.equal(explicitOptions.headers.get("allow"), "custom")
    assert.equal(await explicitOptions.text(), "custom-options")
  } finally {
    child.kill("SIGTERM")
    await new Promise<void>((resolve) => child.once("exit", () => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})
