import type { Context, Hook, NelysiaPlugin } from "../../core/src/index.ts"

export interface RolesOptions {
  resolveRoles?(context: Context): string[] | readonly string[] | Promise<string[] | readonly string[]>
  permissions?: Record<string, readonly string[]>
}

export interface PermissionApi {
  roles: readonly string[]
  has(role: string): boolean
  can(permission: string): boolean
  require(...roles: string[]): void
}

export interface RolesContext {
  permissions: PermissionApi
}

export type RolesPlugin = NelysiaPlugin<RolesContext>

export function roles(options: RolesOptions = {}): RolesPlugin {
  const permissionMap = new Map(Object.entries(options.permissions ?? {}).map(([permission, allowedRoles]) => [permission, new Set(allowedRoles)]))
  return ((app: import("../../core/src/app.ts").Nelysia<any, any, any, any>) => app.derive(async (context: Context) => {
    const resolved = await options.resolveRoles?.(context) ?? []
    const values = [...resolved]
    const set = new Set(values)
    const permissions: PermissionApi = {
      roles: values,
      has: (role) => set.has(role),
      can: (permission) => {
        const allowed = permissionMap.get(permission)
        return allowed === undefined ? false : values.some((role) => allowed.has(role))
      },
      require: (...required) => {
        if (!required.some((role) => set.has(role))) throw new Error("Forbidden")
      }
    }
    return { permissions }
  }) as import("../../core/src/app.ts").Nelysia<any, any, any, any>) as RolesPlugin
}

export function requireRole(...required: string[]): Hook {
  if (required.length === 0) throw new Error("requireRole needs at least one role")
  return ({ permissions }: Context & Partial<RolesContext>) => {
    if (permissions === undefined || !required.some((role) => permissions.has(role))) return new Response("Forbidden", { status: 403 })
  }
}
