import { graphql, type GraphQLSchema } from "graphql"
import type { Nelysia } from "../../core/src/app.ts"

export interface GraphQLOptions {
  schema: GraphQLSchema
  path?: string
  context?(context: unknown): unknown | Promise<unknown>
}

export function graphqlPlugin(options: GraphQLOptions): (app: Nelysia) => Nelysia {
  const path = options.path ?? "/graphql"
  return (app) => {
    app.post(path, async (context) => {
      const body = context.body as { query?: string; variables?: Record<string, unknown>; operationName?: string } | undefined
      if (!body?.query) return context.response(400, { errors: [{ message: "GraphQL query is required" }] })
      const result = await graphql({
        schema: options.schema,
        source: body.query,
        variableValues: body.variables,
        operationName: body.operationName,
        contextValue: await options.context?.(context)
      })
      return context.response(200, JSON.parse(JSON.stringify(result)), { "content-type": "application/json; charset=utf-8" })
    })
    return app
  }
}
