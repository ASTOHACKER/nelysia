import { PrismaClient } from "@prisma/client"
import { Nelysia } from "../../packages/core/src/index.ts"
import { prismaRoute } from "../../packages/integrations-prisma/src/index.ts"

export function createPrismaExample(prisma: PrismaClient): Nelysia<any, any, any> {
  return new Nelysia().use(prismaRoute({
    db: prisma,
    path: "/users",
    query: (client) => client.user.findMany({ orderBy: { id: "asc" } }),
  }))
}
