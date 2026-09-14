import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { integer, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow(),
  googleSub: text("google_sub")
}, (table) => ({
  emailUnique: uniqueIndex("idx_flowly_users_email").on(table.email),
  googleSubUnique: uniqueIndex("idx_flowly_users_google_sub").on(table.googleSub)
}))

export const teams = pgTable("teams", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  name: text("name").notNull(),
  ownerId: integer("owner_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow()
})

export const teamMembers = pgTable("team_members", {
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member")
}, (table) => ({
  primaryKey: primaryKey({ columns: [table.teamId, table.userId] })
}))

export const projects = pgTable("projects", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("active"),
  dueDate: text("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow()
})

export const tasks = pgTable("tasks", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("todo"),
  priority: text("priority").notNull().default("medium"),
  assigneeId: integer("assignee_id").references(() => users.id, { onDelete: "set null" }),
  dueDate: text("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow()
})

export const comments = pgTable("comments", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow()
})

export const activityLogs = pgTable("activity_logs", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  teamId: integer("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: integer("entity_id"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow()
})

export function createDatabase(url: string) {
  const sql = postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false
  })
  return { sql, db: drizzle(sql) }
}

export async function ensureSchema(sql: ReturnType<typeof postgres>) {
  await sql`CREATE TABLE IF NOT EXISTS users (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL DEFAULT 'member',
    created_at timestamptz NOT NULL DEFAULT now(),
    google_sub text
  )`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_flowly_users_email ON users (email)`
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_flowly_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL`
  await sql`CREATE TABLE IF NOT EXISTS teams (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    owner_id integer NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
  )`
  await sql`CREATE TABLE IF NOT EXISTS team_members (
    team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member',
    PRIMARY KEY (team_id, user_id)
  )`
  await sql`CREATE TABLE IF NOT EXISTS projects (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'active',
    due_date text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
  await sql`CREATE TABLE IF NOT EXISTS tasks (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id integer NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    status text NOT NULL DEFAULT 'todo',
    priority text NOT NULL DEFAULT 'medium',
    assignee_id integer REFERENCES users(id) ON DELETE SET NULL,
    due_date text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
  await sql`CREATE TABLE IF NOT EXISTS comments (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id integer NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
  await sql`CREATE TABLE IF NOT EXISTS activity_logs (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id integer NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id integer REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id integer,
    created_at timestamptz NOT NULL DEFAULT now()
  )`
}
