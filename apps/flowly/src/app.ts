import { mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { and, desc, eq } from "drizzle-orm"
import { Nelysia, error, t, type Context, type UploadedFile } from "@narudom96/nelysia"
import { cache } from "@narudom96/nelysia/cache"
import { health } from "@narudom96/nelysia/health"
import { jwt } from "@narudom96/nelysia/jwt"
import { logger } from "@narudom96/nelysia/logger"
import { openapi, swaggerUi } from "@narudom96/nelysia/openapi"
import { cors, rateLimit, securityHeaders } from "@narudom96/nelysia/plugins"
import { roles } from "@narudom96/nelysia/roles"
import { session } from "@narudom96/nelysia/session"
import { timeout } from "@narudom96/nelysia/timeout"
import { diskStorage, upload } from "@narudom96/nelysia/upload"
import { activityLogs, createDatabase, ensureSchema, projects, tasks, teamMembers, teams, users } from "./db.ts"

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error("DATABASE_URL is required")
const { sql, db } = createDatabase(databaseUrl)
await ensureSchema(sql)
const uploadDir = resolve(process.env.FLOWLY_UPLOAD_DIR ?? "./uploads")
mkdirSync(uploadDir, { recursive: true })
const jwtSecret = process.env.FLOWLY_JWT_SECRET ?? "flowly-local-only-change-me"

type AuthContext = Context & { auth?: { sub?: string; role?: string; [key: string]: unknown } }

async function authUser(context: AuthContext) {
  const id = Number(context.auth?.sub)
  if (!Number.isInteger(id) || id < 1) throw error(401, { error: "Unauthorized" })
  const [user] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(eq(users.id, id)).limit(1)
  if (!user) throw error(401, { error: "Unauthorized" })
  return user
}

async function requireTeamMember(userId: number, teamId: number) {
  const [membership] = await db.select().from(teamMembers).where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId))).limit(1)
  if (!membership) throw error(403, { error: "Team access denied" })
}

async function requireProjectAccess(userId: number, projectId: number) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1)
  if (!project) throw error(404, { error: "Project not found" })
  await requireTeamMember(userId, project.teamId)
  return project
}

async function logActivity(teamId: number, userId: number, action: string, entity: string, entityId: number) {
  await db.insert(activityLogs).values({ teamId, userId, action, entity, entityId, createdAt: new Date().toISOString() })
}

const app = new Nelysia()
  .use(cors({ origin: ["http://localhost:3000", "http://localhost:5173"], credentials: true }))
  .use(securityHeaders())
  .use(rateLimit({ limit: 240, windowMs: 60_000 }))
  .use(timeout({ timeoutMs: 15_000 }))
  .use(logger())
  .use(jwt({ secret: jwtSecret, expiresIn: 60 * 60 * 8 }))
  .use(roles({ resolveRoles: (context) => {
    const role = (context as AuthContext).auth?.role
    return role ? [role] : []
  }}))
  .use(session())
  .use(cache({ ttlMs: 5_000 }))
  .use(health({ checks: { database: async () => { await sql`SELECT 1`; return true } } }))
  .use(openapi({ title: "Flowly API", version: "0.1.0" }))
  .use(swaggerUi({ title: "Flowly API Docs" }))
  .use(upload({ maxFileSize: 10 * 1024 * 1024, maxFiles: 5, storage: diskStorage(uploadDir) }))
  .get("/api/me", async (context) => authUser(context as AuthContext), { auth: true })
  .get("/api/teams", async (context) => {
    const user = await authUser(context as AuthContext)
    return db.select({ id: teams.id, name: teams.name, role: teamMembers.role, createdAt: teams.createdAt })
      .from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).where(eq(teamMembers.userId, user.id))
  }, { auth: true })
  .get("/api/teams/:teamId/projects", async (context) => {
    const user = await authUser(context as AuthContext)
    const teamId = Number(context.params.teamId)
    await requireTeamMember(user.id, teamId)
    return db.select().from(projects).where(eq(projects.teamId, teamId)).orderBy(desc(projects.createdAt))
  }, { auth: true })
  .post("/api/teams/:teamId/projects", async (context) => {
    const user = await authUser(context as AuthContext)
    const teamId = Number(context.params.teamId)
    await requireTeamMember(user.id, teamId)
    const [project] = await db.insert(projects).values({ teamId, name: context.body.name, description: context.body.description ?? "", dueDate: context.body.dueDate ?? null, createdAt: new Date().toISOString() }).returning()
    await logActivity(teamId, user.id, "created", "project", project.id)
    return project
  }, { auth: true, body: t.Object({ name: t.String(), description: t.Optional(t.String()), dueDate: t.Optional(t.String()) }) })
  .get("/api/projects/:projectId/tasks", async (context) => {
    const user = await authUser(context as AuthContext)
    const project = await requireProjectAccess(user.id, Number(context.params.projectId))
    return db.select().from(tasks).where(eq(tasks.projectId, project.id)).orderBy(desc(tasks.createdAt))
  }, { auth: true })
  .post("/api/projects/:projectId/tasks", async (context) => {
    const user = await authUser(context as AuthContext)
    const project = await requireProjectAccess(user.id, Number(context.params.projectId))
    const [task] = await db.insert(tasks).values({ projectId: project.id, title: context.body.title, description: context.body.description ?? "", priority: context.body.priority ?? "medium", assigneeId: context.body.assigneeId ?? null, dueDate: context.body.dueDate ?? null, createdAt: new Date().toISOString() }).returning()
    await logActivity(project.teamId, user.id, "created", "task", task.id)
    return task
  }, { auth: true, body: t.Object({ title: t.String(), description: t.Optional(t.String()), priority: t.Optional(t.String()), assigneeId: t.Optional(t.Number()), dueDate: t.Optional(t.String()) }) })
  .patch("/api/tasks/:taskId", async (context) => {
    const user = await authUser(context as AuthContext)
    const [task] = await db.select().from(tasks).where(eq(tasks.id, Number(context.params.taskId))).limit(1)
    if (!task) throw error(404, { error: "Task not found" })
    const project = await requireProjectAccess(user.id, task.projectId)
    const [updatedTask] = await db.update(tasks).set({ status: context.body.status ?? task.status, priority: context.body.priority ?? task.priority, assigneeId: context.body.assigneeId ?? task.assigneeId }).where(eq(tasks.id, task.id)).returning()
    await logActivity(project.teamId, user.id, "updated", "task", task.id)
    return updatedTask
  }, { auth: true, body: t.Object({ status: t.Optional(t.String()), priority: t.Optional(t.String()), assigneeId: t.Optional(t.Number()) }) })
  .post("/api/uploads", async (context) => {
    const user = await authUser(context as AuthContext)
    const entries = Object.entries(context.files ?? {}) as Array<[string, UploadedFile[]]>
    return { uploadedBy: user.id, files: Object.fromEntries(entries.map(([field, values]) => [field, values.map((file) => ({ filename: file.filename, contentType: file.contentType, size: file.size, storage: file.storage }))])) }
  }, { auth: true })

export { app }

const port = Number(process.env.PORT ?? 3000)
app.listen(port, ({ url }) => console.log(`Flowly API running at ${url}`))
