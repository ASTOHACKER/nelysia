import assert from "node:assert/strict"
import { PrismaClient } from "@prisma/client"
import { createPrismaExample } from "./route.ts"

const prisma = new PrismaClient()

try {
  await prisma.user.deleteMany()
  await prisma.user.create({ data: { name: "Ada" } })
  const response = await createPrismaExample(prisma).handle({ method: "GET", url: "/users" })
  assert.equal(response.status, 200)
  const users = response.body as { id: number; name: string }[]
  assert.deepEqual(users.map(({ name }) => ({ name })), [{ name: "Ada" }])
  console.log("Prisma SQLite smoke test passed")
} finally {
  await prisma.$disconnect()
}
