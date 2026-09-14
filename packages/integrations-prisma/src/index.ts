import type { Nelysia } from "../../core/src/app.ts"
import type { Context } from "../../core/src/types.ts"

export interface PrismaRouteOptions<PrismaClient> {
  db: PrismaClient
  path?: string
  query(database: PrismaClient, context: Context): unknown | Promise<unknown>
}

export function prismaRoute<PrismaClient>(options: PrismaRouteOptions<PrismaClient>): (app: Nelysia<any, any, any>) => Nelysia<any, any, any> {
  return (app) => {
    app.get(options.path ?? "/db", (context) => options.query(options.db, context))
    return app
  }
}
