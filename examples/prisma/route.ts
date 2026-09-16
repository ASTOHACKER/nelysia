import { PrismaClient } from "@prisma/client"
import { Nelysia } from "@narudom96/nelysia"
import { prismaRoute } from "@narudom96/nelysia/prisma"

export function createPrismaExample(prisma: PrismaClient): Nelysia<any, any, any> {
  return new Nelysia().use(prismaRoute({
    db: prisma,
    path: "/users",
    query: (client) => client.user.findMany({ orderBy: { id: "asc" } }),
  }))
}
