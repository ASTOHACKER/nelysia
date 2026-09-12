import type { Nelysia } from "../../core/src/app.ts"
import type { Context } from "../../core/src/types.ts"

export interface DrizzleRouteOptions<Database> {
  db: Database
  path?: string
  query(database: Database, context: Context): unknown | Promise<unknown>
}

export function drizzleRoute<Database>(options: DrizzleRouteOptions<Database>): (app: Nelysia) => Nelysia {
  return (app) => {
    app.get(options.path ?? "/db", (context) => options.query(options.db, context))
    return app
  }
}
