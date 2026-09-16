import assert from "node:assert/strict"
import { GraphQLObjectType, GraphQLSchema, GraphQLString } from "graphql"
import { Nelysia } from "@narudom96/nelysia"
import { drizzleRoute } from "@narudom96/nelysia/drizzle"
import { betterAuthPlugin } from "@narudom96/nelysia/better-auth"
import { graphqlPlugin } from "@narudom96/nelysia/graphql"

// Drizzle: in-memory fake db, no sqlite dependency needed for the smoke.
const drizzleApp = new Nelysia().use(drizzleRoute({
  db: { users: [{ name: "Ada" }] },
  query: (db: { users: { name: string }[] }) => db.users,
}))
const drizzleRes = await drizzleApp.handle({ method: "GET", url: "/db" })
assert.equal(drizzleRes.status, 200)
assert.deepEqual(drizzleRes.body, [{ name: "Ada" }])
console.log("Drizzle smoke passed")

// Better Auth: fake handler + session resolver, no network.
const fakeAuth = {
  handler: (request: Request) => new Response(`auth:${new URL(request.url).pathname}`, { status: 200 }),
  getSession: async (request: Request) => request.headers.get("x-session") === "valid" ? { user: "Ada" } : null,
}
const authApp = new Nelysia()
  .use(betterAuthPlugin(fakeAuth))
  .get("/me", ({ auth }) => ({ user: auth }), { auth: "session" })
const anonRes = await authApp.handle({ method: "GET", url: "http://local/me", headers: new Headers() })
assert.equal(anonRes.status, 401)
const sessionRes = await authApp.handle({ method: "GET", url: "http://local/me", headers: new Headers({ "x-session": "valid" }) })
assert.equal(sessionRes.status, 200)
const passthrough = await authApp.injectUntyped({ method: "GET", path: "/api/auth/session" })
assert.equal(passthrough.status, 200)
console.log("Better Auth smoke passed")

// GraphQL: real graphql-js execution through the plugin.
const schema = new GraphQLSchema({
  query: new GraphQLObjectType({
    name: "Query",
    fields: { hello: { type: GraphQLString, resolve: () => "world" } },
  }),
})
const gqlApp = new Nelysia().use(graphqlPlugin({ schema }))
const gqlRes = await gqlApp.inject({ method: "POST", path: "/graphql", body: { query: "{ hello }" } })
assert.equal(gqlRes.status, 200)
assert.deepEqual((gqlRes.body as { data: unknown }).data, { hello: "world" })
const gqlBad = await gqlApp.inject({ method: "POST", path: "/graphql", body: {} })
assert.equal(gqlBad.status, 400)
console.log("GraphQL smoke passed")

console.log("Integrations smoke passed (drizzle/better-auth/graphql)")
