import { allowedMethodsFor, compilePath, lookupDynamicRoute, normalizeMethod, normalizePathname, splitSegments } from "./router.ts"
import { fromStandardSchema, type Schema, type StandardSchema } from "./schema.ts"
import { HttpError, responseMarker, type AddRoute, type AfterHook, type AfterResponseHook, type ApplyGuard, type Context, type ContextExtension, type CookieOptions, type ErrorHandler, type FetchHandler, type GuardOptions, type Handler, type Hook, type HookOptions, type InjectOptions, type InjectResponse, type ListenOptions, type MacroDefinition, type MapResponseHook, type MergeRouteMaps, type ModelValues, type ModuleGraphNode, type NelysiaOptions, type ParseHook, type ParsedQuery, type RequestData, type RequestHook, type ResponseData, type RouteContext, type RouteGraph, type RouteGuard, type RouteMap, type RouteOptions, type RouteRecord, type SchemaInput, type ServerInfo, type Telemetry, type TransformHook, type WebSocketHandlers } from "./types.ts"
import { createBunServer } from "../../runtime-bun/src/server.ts"

const asHeaders = (headers?: Headers): Headers => headers ?? new Headers()
const defaultSignal = new AbortController().signal

type PluginCallback = (app: Nelysia<any>) => Nelysia<any> | void | Promise<Nelysia<any> | void>
type Plugin = Nelysia<any> | PluginCallback
type LazyPlugin = Plugin | Promise<Plugin | { default?: Plugin; app?: Plugin }>
type RoutesOf<App> = App extends Nelysia<any, infer Routes, any> ? Routes : {}
type ModelsOf<App> = App extends Nelysia<any, any, infer Models> ? Models : {}
type PrefixRoutes<Prefix extends string, Routes extends RouteMap> = {
  [Key in keyof Routes as Key extends `${infer Method} ${infer Path}` ? `${Method} ${JoinRoutePath<Prefix, Path>}` : never]: Routes[Key]
}
type TrimLeftSlash<Value extends string> = Value extends `/${infer Rest}` ? TrimLeftSlash<Rest> : Value
type TrimRightSlash<Value extends string> = Value extends `${infer Rest}/` ? TrimRightSlash<Rest> : Value
type CleanPrefix<Value extends string> = TrimLeftSlash<TrimRightSlash<Value>>
type JoinRoutePath<Prefix extends string, Path extends string> = Prefix extends "/"
  ? Path
  : Path extends "/"
    ? `/${CleanPrefix<Prefix>}`
    : `/${CleanPrefix<Prefix>}/${TrimLeftSlash<Path>}`
type AddAllRoutes<Routes extends RouteMap, Path extends string, Options extends object, Result> =
  AddRoute<AddRoute<AddRoute<AddRoute<AddRoute<AddRoute<AddRoute<Routes, "GET", Path, Options, Result>, "POST", Path, Options, Result>, "PUT", Path, Options, Result>, "PATCH", Path, Options, Result>, "DELETE", Path, Options, Result>, "OPTIONS", Path, Options, Result>, "HEAD", Path, Options, Result>

export class Nelysia<Extensions extends Record<string, unknown> = any, Routes extends RouteMap = {}, Models extends Record<string, unknown> = {}> {
  readonly graph: RouteGraph = { routes: [] }
  readonly prefix: string
  readonly name?: string
  readonly seed?: unknown
  readonly bodyLimit: number
  private readonly trustedProxy: boolean
  private readonly secureCookies: boolean
  private hooks: Hook[] = []
  private localHooks: Hook[] = []
  private requestHooks: RequestHook[] = []
  private localRequestHooks: RequestHook[] = []
  private globalRequestHooks: RequestHook[] = []
  private parseHooks: ParseHook[] = []
  private localParseHooks: ParseHook[] = []
  private globalParseHooks: ParseHook[] = []
  private transformHooks: TransformHook[] = []
  private mapResponseHooks: MapResponseHook[] = []
  private localMapResponseHooks: MapResponseHook[] = []
  private globalMapResponseHooks: MapResponseHook[] = []
  private afterResponseHooks: AfterResponseHook[] = []
  private localAfterResponseHooks: AfterResponseHook[] = []
  private globalAfterResponseHooks: AfterResponseHook[] = []
  private scopedHooks: Hook[] = []
  private globalHooks: Hook[] = []
  private afterHooks: AfterHook[] = []
  private localAfterHooks: AfterHook[] = []
  private scopedAfterHooks: AfterHook[] = []
  private errorHandlers: ErrorHandler[] = []
  private localErrorHandlers: ErrorHandler[] = []
  private scopedErrorHandlers: ErrorHandler[] = []
  private readonly contextValues = new Map<string, unknown>()
  private readonly models = new Map<string, Schema | StandardSchema>()
  private readonly macros = new Map<string, MacroDefinition>()
  private contextExtensionHooks: Hook[] = []
  private readonly usedPlugins = new Set<string>()
  private readonly namedPlugins = new Map<string, string>()
  private readonly moduleDependencies = new Set<Nelysia<any>>()
  private readonly modulePromises: Promise<void>[] = []
  private moduleState: "loaded" | "pending" | "rejected" = "loaded"
  private moduleLoadError?: unknown
  readonly telemetry?: Telemetry
  readonly websocketRoutes: { path: string; handlers: WebSocketHandlers }[] = []
  private readonly fetchMounts: { prefix: string; handler: FetchHandler }[] = []
  private readonly staticRoutes = new Map<string, RouteRecord>()
  private readonly dynamicRoutes = new Map<string, RouteRecord[]>()
  private readonly routeGuardRegistrations: Array<{ guard: RouteGuard; applies: (auth: RouteRecord["auth"]) => boolean }> = []
  /** Public so runtime adapters can skip UUID generation when disabled. */
  readonly requestIdEnabled: boolean
  private notFoundHandler?: Handler

  constructor(options: NelysiaOptions = {}) {
    this.prefix = normalizePrefix(options.prefix)
    this.name = options.name
    this.seed = options.seed
    this.bodyLimit = options.bodyLimit ?? 1024 * 1024
    this.telemetry = options.telemetry
    this.trustedProxy = options.trustedProxy ?? false
    this.secureCookies = options.secureCookies ?? false
    this.requestIdEnabled = options.requestId ?? true
  }

  /** Internal extension point for route-scoped guards such as JWT auth. */
  registerRouteGuard(guard: RouteGuard, applies: (auth: RouteRecord["auth"]) => boolean): this {
    this.routeGuardRegistrations.push({ guard, applies })
    for (const route of this.graph.routes) {
      if (!applies(route.auth)) continue
      route.routeGuards ??= []
      if (!route.routeGuards.includes(guard)) route.routeGuards.push(guard)
    }
    return this
  }

  private routeGuardsFor(auth: RouteRecord["auth"]): RouteGuard[] {
    return this.routeGuardRegistrations.filter((registration) => registration.applies(auth)).map((registration) => registration.guard)
  }

  onBeforeHandle(hook: Hook): this
  onBeforeHandle(options: HookOptions, hook: Hook): this
  onBeforeHandle(optionsOrHook: Hook | HookOptions, maybeHook?: Hook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onBeforeHandle requires a hook")
    this.hooks.push(hook)
    if (options.as === "local") this.localHooks.push(hook)
    if (options.as === "scoped") this.scopedHooks.push(hook)
    if (options.as === "global") this.globalHooks.push(hook)
    for (const route of this.graph.routes) route.hooks.push(hook)
    return this
  }

  onRequest(hook: RequestHook): this
  onRequest(options: HookOptions, hook: RequestHook): this
  onRequest(optionsOrHook: RequestHook | HookOptions, maybeHook?: RequestHook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onRequest requires a hook")
    this.requestHooks.push(hook)
    if (options.as === "local") this.localRequestHooks.push(hook)
    if (options.as === "global") this.globalRequestHooks.push(hook)
    for (const route of this.graph.routes) route.requestHooks?.push(hook)
    return this
  }

  onParse(hook: ParseHook): this
  onParse(options: HookOptions, hook: ParseHook): this
  onParse(optionsOrHook: ParseHook | HookOptions, maybeHook?: ParseHook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onParse requires a hook")
    this.parseHooks.push(hook)
    if (options.as === "local") this.localParseHooks.push(hook)
    if (options.as === "global") this.globalParseHooks.push(hook)
    for (const route of this.graph.routes) route.parseHooks?.push(hook)
    return this
  }

  onTransform(hook: TransformHook): this
  onTransform(options: HookOptions, hook: TransformHook): this
  onTransform(optionsOrHook: TransformHook | HookOptions, maybeHook?: TransformHook): this {
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onTransform requires a hook")
    this.transformHooks.push(hook)
    if (typeof optionsOrHook !== "function" && optionsOrHook.as === "local") this.localHooks.push(hook)
    for (const route of this.graph.routes) route.hooks.unshift(hook)
    if (typeof optionsOrHook !== "function" && optionsOrHook.as === "scoped") this.scopedHooks.push(hook)
    if (typeof optionsOrHook !== "function" && optionsOrHook.as === "global") this.globalHooks.push(hook)
    return this
  }

  mapResponse(hook: MapResponseHook): this
  mapResponse(options: HookOptions, hook: MapResponseHook): this
  mapResponse(optionsOrHook: MapResponseHook | HookOptions, maybeHook?: MapResponseHook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("mapResponse requires a hook")
    this.mapResponseHooks.push(hook)
    if (options.as === "local") this.localMapResponseHooks.push(hook)
    if (options.as === "global") this.globalMapResponseHooks.push(hook)
    for (const route of this.graph.routes) route.mapResponseHooks?.push(hook)
    return this
  }

  onAfterResponse(hook: AfterResponseHook): this
  onAfterResponse(options: HookOptions, hook: AfterResponseHook): this
  onAfterResponse(optionsOrHook: AfterResponseHook | HookOptions, maybeHook?: AfterResponseHook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onAfterResponse requires a hook")
    this.afterResponseHooks.push(hook)
    if (options.as === "local") this.localAfterResponseHooks.push(hook)
    if (options.as === "global") this.globalAfterResponseHooks.push(hook)
    for (const route of this.graph.routes) route.afterResponseHooks?.push(hook)
    return this
  }

  as(scope: HookOptions["as"]): this {
    if (scope === "scoped") {
      for (const hook of this.hooks) if (!this.scopedHooks.includes(hook)) this.scopedHooks.push(hook)
    }
    if (scope === "global") {
      for (const hook of this.hooks) if (!this.globalHooks.includes(hook)) this.globalHooks.push(hook)
    }
    return this
  }

  onAfterHandle(hook: AfterHook): this
  onAfterHandle(options: HookOptions, hook: AfterHook): this
  onAfterHandle(optionsOrHook: AfterHook | HookOptions, maybeHook?: AfterHook): this {
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onAfterHandle requires a hook")
    this.afterHooks.push(hook)
    if (typeof optionsOrHook !== "function" && optionsOrHook.as === "local") this.localAfterHooks.push(hook)
    if (typeof optionsOrHook !== "function" && optionsOrHook.as === "scoped") this.scopedAfterHooks.push(hook)
    for (const route of this.graph.routes) route.afterHooks.push(hook)
    return this
  }

  onError(handler: ErrorHandler): this
  onError(options: HookOptions, handler: ErrorHandler): this
  onError(optionsOrHandler: ErrorHandler | HookOptions, maybeHandler?: ErrorHandler): this {
    const handler = typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler
    if (!handler) throw new Error("onError requires a handler")
    this.errorHandlers.push(handler)
    if (typeof optionsOrHandler !== "function" && optionsOrHandler.as === "local") this.localErrorHandlers.push(handler)
    if (typeof optionsOrHandler !== "function" && optionsOrHandler.as === "scoped") this.scopedErrorHandlers.push(handler)
    for (const route of this.graph.routes) route.errorHandlers.push(handler)
    return this
  }

  state<K extends string, Value>(name: K, value: Value): Nelysia<Extensions & { store: Record<K, Value> }, Routes, Models> {
    this.contextValues.set(name, value)
    return this as unknown as Nelysia<Extensions & { store: Record<K, Value> }, Routes, Models>
  }

  decorate<K extends string, Value>(name: K, value: Value | ((context: Context & Extensions) => Value)): Nelysia<Extensions & Record<K, Value>, Routes, Models> {
    this.contextValues.set(name, value)
    return this as unknown as Nelysia<Extensions & Record<K, Value>, Routes, Models>
  }

  derive<Added extends Record<string, unknown>>(extension: (context: Context & Extensions) => Added | void | Promise<Added | void>): Nelysia<Extensions & Added, Routes, Models> {
    this.addContextExtension(extension as ContextExtension)
    return this as unknown as Nelysia<Extensions & Added, Routes, Models>
  }

  resolve<Added extends Record<string, unknown>>(extension: (context: Context & Extensions) => Added | void | Promise<Added | void>): Nelysia<Extensions & Added, Routes, Models> {
    this.addContextExtension(extension as ContextExtension)
    return this as unknown as Nelysia<Extensions & Added, Routes, Models>
  }

  macro(definitions: Record<string, MacroDefinition>): this {
    for (const [name, definition] of Object.entries(definitions)) this.macros.set(name, definition)
    return this
  }

  model<Definitions extends Record<string, Schema | StandardSchema>>(models: Definitions): Nelysia<Extensions, Routes, Models & ModelValues<Definitions>> {
    for (const [name, schema] of Object.entries(models)) {
      if (hasCircularSchemaDefinition(schema)) throw new Error(`Circular model definition: ${name}`)
      const existing = this.models.get(name)
      if (existing !== undefined && stableSchema(existing) !== stableSchema(schema)) throw new Error(`Conflicting model definition: ${name}`)
      this.models.set(name, schema)
    }
    return this as unknown as Nelysia<Extensions, Routes, Models & ModelValues<Definitions>>
  }

  guard<Guard extends GuardOptions<Models>, Child extends Nelysia<any, any, any>>(options: Guard, callback: (app: Nelysia) => Child): Nelysia<Extensions, MergeRouteMaps<Routes, ApplyGuard<RoutesOf<Child>, Guard, Models>>, Models & ModelsOf<Child>>
  guard(options: GuardOptions<Models>, callback: (app: Nelysia) => void): this
  guard(options: GuardOptions<Models>, callback: (app: Nelysia) => void): this {
    const child = new Nelysia({
      bodyLimit: this.bodyLimit,
      trustedProxy: this.trustedProxy,
      secureCookies: this.secureCookies,
      requestId: this.requestIdEnabled,
      telemetry: this.telemetry
    })
    for (const [name, schema] of this.models) child.models.set(name, schema)
    callback(child)
    this.applyGuard(child, options)
    this.mount("/", child)
    return this
  }

  notFound(handler: Handler): this {
    this.notFoundHandler = handler
    return this
  }

  use<PluginApp extends Nelysia<any, any, any>>(plugin: PluginApp): Nelysia<Extensions, MergeRouteMaps<Routes, RoutesOf<PluginApp>>, Models & ModelsOf<PluginApp>>
  use<PluginApp extends Nelysia<any, any, any>>(plugin: (app: Nelysia) => PluginApp): Nelysia<Extensions, MergeRouteMaps<Routes, RoutesOf<PluginApp>>, Models & ModelsOf<PluginApp>>
  use(plugin: LazyPlugin): this
  use(plugin: LazyPlugin): this {
    if (isPromiseLike(plugin)) {
      this.moduleState = "pending"
      const pending = Promise.resolve(plugin).then((loaded) => {
        const resolved = isPluginWrapper(loaded) ? loaded.default ?? loaded.app : loaded
        if (resolved === undefined || resolved === null || (!isNelysia(resolved) && typeof resolved !== "function")) throw new Error("Lazy module must resolve to a Nelysia instance or plugin")
        this.use(resolved as LazyPlugin)
      }).then(() => {
        this.moduleState = "loaded"
      }, (error) => {
        this.moduleState = "rejected"
        this.moduleLoadError = error
        throw error
      })
      this.modulePromises.push(pending)
      return this
    }
    if (isNelysia(plugin)) {
      if (plugin === this || plugin.dependsOn(this)) throw new Error("Circular Nelysia module dependency")
      const identity = plugin.name === undefined ? undefined : `name:${plugin.name}:${stableSeed(plugin.seed)}`
      if (plugin.name !== undefined) {
        const existing = this.namedPlugins.get(plugin.name)
        const seed = stableSeed(plugin.seed)
        if (existing !== undefined && existing !== seed) throw new Error(`Conflicting named module: ${plugin.name}`)
        this.namedPlugins.set(plugin.name, seed)
      }
      if (identity !== undefined && this.usedPlugins.has(identity)) return this
      if (identity !== undefined) this.usedPlugins.add(identity)
      this.moduleDependencies.add(plugin)
      if (plugin.modulePromises.length > 0 || plugin.moduleState === "pending") {
        this.moduleState = "pending"
        this.modulePromises.push(plugin.modules.then(() => {
          this.mount("/", plugin)
        }).then(() => {
          this.moduleState = "loaded"
        }, (error) => {
          this.moduleState = "rejected"
          this.moduleLoadError = error
          throw error
        }))
      } else {
        this.mount("/", plugin)
      }
      return this
    }
    const result = (plugin as PluginCallback)(this)
    if (isPromiseLike(result)) {
      this.moduleState = "pending"
      this.modulePromises.push(Promise.resolve(result).then((resolved) => {
        if (resolved !== undefined && resolved !== this) this.use(resolved as LazyPlugin)
      }).then(() => {
        this.moduleState = "loaded"
      }, (error) => {
        this.moduleState = "rejected"
        this.moduleLoadError = error
        throw error
      }))
    }
    return this
  }

  get modules(): Promise<void> {
    return this.waitForModules()
  }

  get moduleGraph(): ModuleGraphNode {
    return this.describeModule(new Set())
  }

  get hasGlobalLifecycle(): boolean {
    return this.requestHooks.length > 0 || this.parseHooks.length > 0 || this.mapResponseHooks.length > 0 || this.afterResponseHooks.length > 0
  }

  get hasFetchMounts(): boolean {
    return this.fetchMounts.length > 0
  }

  get modelDefinitions(): ReadonlyMap<string, Schema | StandardSchema> {
    return this.models
  }

  get<Path extends string, Options extends RouteOptions<Models> = RouteOptions<Models>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "GET", Path, Options, Result, Models>, Models>
  get<Path extends string, Value>(path: Path, body: Value, options?: RouteOptions<Models>): Nelysia<Extensions, AddRoute<Routes, "GET", Path, RouteOptions<Models>, Value, Models>, Models>
  get(path: string, handlerOrBody: Handler<any> | string | number | boolean | Record<string, unknown>, options?: RouteOptions): this {
    const app = this.route("GET", path, typeof handlerOrBody === "function" ? handlerOrBody : () => handlerOrBody, options)
    if (typeof handlerOrBody !== "function") {
      this.graph.routes[this.graph.routes.length - 1].contextFree = true
      this.graph.routes[this.graph.routes.length - 1].staticValue = handlerOrBody
    }
    return app
  }
  getStatic(path: string, body: unknown): this {
    this.route("GET", path, () => body)
    this.graph.routes[this.graph.routes.length - 1].contextFree = true
    this.graph.routes[this.graph.routes.length - 1].staticValue = body
    return this
  }
  post<Path extends string, Options extends RouteOptions<Models> = RouteOptions<Models>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "POST", Path, Options, Result, Models>, Models> { return this.route("POST", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "POST", Path, Options, Result, Models>, Models> }
  put<Path extends string, Options extends RouteOptions<Models> = RouteOptions<Models>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "PUT", Path, Options, Result, Models>, Models> { return this.route("PUT", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "PUT", Path, Options, Result, Models>, Models> }
  patch<Path extends string, Options extends RouteOptions<Models> = RouteOptions<Models>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "PATCH", Path, Options, Result, Models>, Models> { return this.route("PATCH", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "PATCH", Path, Options, Result, Models>, Models> }
  delete<Path extends string, Options extends RouteOptions<Models> = RouteOptions<Models>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "DELETE", Path, Options, Result, Models>, Models> { return this.route("DELETE", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "DELETE", Path, Options, Result, Models>, Models> }
  head<Path extends string, Options extends RouteOptions<Models> = RouteOptions<Models>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "HEAD", Path, Options, Result, Models>, Models> { return this.route("HEAD", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "HEAD", Path, Options, Result, Models>, Models> }
  options<Path extends string, Options extends RouteOptions<Models> = RouteOptions<Models>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "OPTIONS", Path, Options, Result, Models>, Models> { return this.route("OPTIONS", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "OPTIONS", Path, Options, Result, Models>, Models> }

  all<Path extends string, Options extends RouteOptions<Models> = RouteOptions<Models>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddAllRoutes<Routes, Path, Options, Result>, Models> {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) this.route(method, path, handler, options)
    return this as unknown as Nelysia<Extensions, AddAllRoutes<Routes, Path, Options, Result>, Models>
  }

  websocket(path: string, handlers: WebSocketHandlers): this {
    this.websocketRoutes.push({ path, handlers })
    return this
  }

  mount<Prefix extends string, Child extends Nelysia<any, any, any>>(prefix: Prefix, child: Child): Nelysia<Extensions, MergeRouteMaps<Routes, PrefixRoutes<Prefix, RoutesOf<Child>>>, Models & ModelsOf<Child>>
  mount(prefix: string, handler: FetchHandler): this
  mount(prefix: string, childOrHandler: Nelysia<any> | FetchHandler): this {
    if (typeof childOrHandler === "function") {
      this.fetchMounts.push({ prefix: normalizePrefix(prefix), handler: childOrHandler })
      return this
    }
    const child = childOrHandler
    const base = prefix === "/" ? "" : prefix.replace(/\/$/, "")
    for (const [name, value] of child.contextValues) {
      if (!this.contextValues.has(name)) this.contextValues.set(name, value)
    }
    for (const [name, schema] of child.models) {
      const existing = this.models.get(name)
      if (existing !== undefined && stableSchema(existing) !== stableSchema(schema)) throw new Error(`Conflicting model definition: ${name}`)
      if (!this.models.has(name)) this.models.set(name, schema)
    }
    const mountedRoutes: RouteRecord[] = []
    for (const route of child.graph.routes) {
      const path = `${base}${route.path === "/" ? "" : route.path}`.replace(/\/\/+/g, "/") || "/"
      const metadata = compilePath(path)
      if (this.graph.routes.some((candidate) => candidate.method === route.method && candidate.path === path)) throw new Error(`Duplicate route: ${route.method} ${path}`)
      const mounted: RouteRecord = {
        ...route,
        path,
        ...metadata,
        hooks: uniqueHooks([...this.contextExtensionHooks, ...this.hooks.filter((hook) => !this.localHooks.includes(hook)), ...this.scopedHooks, ...route.hooks]),
        requestHooks: uniqueIdentity([...(route.requestHooks ?? []), ...child.requestHooks, ...this.requestHooks.filter((hook) => !this.localRequestHooks.includes(hook))]),
        parseHooks: uniqueIdentity([...(route.parseHooks ?? []), ...child.parseHooks, ...this.parseHooks.filter((hook) => !this.localParseHooks.includes(hook))]),
        mapResponseHooks: uniqueIdentity([...(route.mapResponseHooks ?? []), ...child.mapResponseHooks, ...this.mapResponseHooks.filter((hook) => !this.localMapResponseHooks.includes(hook))]),
        afterResponseHooks: uniqueIdentity([...(route.afterResponseHooks ?? []), ...child.afterResponseHooks, ...this.afterResponseHooks.filter((hook) => !this.localAfterResponseHooks.includes(hook))]),
        afterHooks: uniqueIdentity([...this.afterHooks.filter((hook) => !this.localAfterHooks.includes(hook)), ...this.scopedAfterHooks, ...route.afterHooks]),
        // Give the mounted route's own handlers first chance to recover its
        // failures; parent handlers remain the fallback for the subtree.
        errorHandlers: uniqueIdentity([...route.errorHandlers, ...child.scopedErrorHandlers, ...this.errorHandlers.filter((handler) => !this.localErrorHandlers.includes(handler)), ...this.scopedErrorHandlers]),
        routeGuards: uniqueIdentity([...(route.routeGuards ?? []), ...this.routeGuardsFor(route.auth)])
      }
      this.registerRoute(mounted)
      mountedRoutes.push(mounted)
    }
    for (const hook of child.scopedHooks) {
      for (const route of mountedRoutes) if (!route.hooks.includes(hook)) route.hooks.push(hook)
    }
    for (const hook of child.globalHooks) {
      if (!this.hooks.includes(hook)) this.hooks.push(hook)
      for (const route of this.graph.routes) if (!route.hooks.includes(hook)) route.hooks.push(hook)
    }
    if (child.globalHooks.length > 0) {
      this.globalHooks.push(...child.globalHooks.filter((hook) => !this.globalHooks.includes(hook)))
    }
    for (const hook of child.globalRequestHooks) {
      if (!this.requestHooks.includes(hook)) this.requestHooks.push(hook)
      for (const route of this.graph.routes) if (!route.requestHooks?.includes(hook)) route.requestHooks?.push(hook)
    }
    for (const hook of child.globalParseHooks) {
      if (!this.parseHooks.includes(hook)) this.parseHooks.push(hook)
      for (const route of this.graph.routes) if (!route.parseHooks?.includes(hook)) route.parseHooks?.push(hook)
    }
    for (const hook of child.globalMapResponseHooks) {
      if (!this.mapResponseHooks.includes(hook)) this.mapResponseHooks.push(hook)
      for (const route of this.graph.routes) if (!route.mapResponseHooks?.includes(hook)) route.mapResponseHooks?.push(hook)
    }
    for (const hook of child.globalAfterResponseHooks) {
      if (!this.afterResponseHooks.includes(hook)) this.afterResponseHooks.push(hook)
      for (const route of this.graph.routes) if (!route.afterResponseHooks?.includes(hook)) route.afterResponseHooks?.push(hook)
    }
    for (const ws of child.websocketRoutes) {
      const path = `${base}${ws.path === "/" ? "" : ws.path}`.replace(/\/\/+/g, "/") || "/"
      this.websocketRoutes.push({ path, handlers: ws.handlers })
    }
    return this
  }

  group<Prefix extends string, Child extends Nelysia<any, any, any>>(prefix: Prefix, callback: (app: Nelysia) => Child): Nelysia<Extensions, MergeRouteMaps<Routes, PrefixRoutes<Prefix, RoutesOf<Child>>>, Models & ModelsOf<Child>>
  group(prefix: string, callback: (app: Nelysia) => void): this
  group<Prefix extends string, Guard extends GuardOptions<Models>, Child extends Nelysia<any, any, any>>(prefix: Prefix, options: Guard, callback: (app: Nelysia) => Child): Nelysia<Extensions, MergeRouteMaps<Routes, PrefixRoutes<Prefix, ApplyGuard<RoutesOf<Child>, Guard, Models>>>, Models & ModelsOf<Child>>
  group(prefix: string, options: GuardOptions<Models>, callback: (app: Nelysia) => void): this
  group(prefix: string, optionsOrCallback: GuardOptions<Models> | ((app: Nelysia) => void), maybeCallback?: (app: Nelysia) => void): this {
    const child = new Nelysia({
      bodyLimit: this.bodyLimit,
      trustedProxy: this.trustedProxy,
      secureCookies: this.secureCookies,
      requestId: this.requestIdEnabled,
      telemetry: this.telemetry
    })
    const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback
    if (!callback) throw new Error("group requires a callback")
    callback(child)
    if (typeof optionsOrCallback !== "function") this.applyGuard(child, optionsOrCallback)
    this.mount(prefix, child)
    return this
  }

  listen(
    port: number | { port: number; hostname?: string },
    callback?: (info: ServerInfo) => void
  ): unknown {
    const actualPort = typeof port === "number" ? port : port.port
    const hostname = typeof port === "object" ? port.hostname : undefined
    const runtime = globalThis as typeof globalThis & { Bun?: unknown }
    if (runtime.Bun && this.modulePromises.length === 0) {
      const server = createBunServer(this, actualPort) as { port: number; hostname?: string }
      const resolvedHost = server.hostname ?? hostname ?? "localhost"
      const info: ServerInfo = {
        port: server.port,
        hostname: resolvedHost,
        url: `http://${resolvedHost}:${server.port}`,
        server
      }
      if (callback) callback(info)
      return server
    }
    const start = async () => {
      const { createNodeServer } = await import("../../runtime-node/src/server.ts")
      const nodeServer = createNodeServer(this)
      if (callback) {
        nodeServer.listen(actualPort, hostname, () => {
          const addr = nodeServer.address()
          const p = typeof addr === "object" && addr ? addr.port : actualPort
          const h = hostname ?? "localhost"
          const info: ServerInfo = {
            port: p,
            hostname: h,
            url: `http://${h}:${p}`,
            server: nodeServer
          }
          callback(info)
        })
        return nodeServer
      }
      return nodeServer.listen(actualPort, hostname)
    }
    const pending = this.modulePromises.length > 0 ? this.waitForModules().then(start) : start()
    return attachServerControls(pending)
  }

  async inject(options: InjectOptions = {}): Promise<InjectResponse> {
    await this.waitForModules()
    let url = options.url ?? options.path ?? "/"
    if (options.query) {
      const q = new URLSearchParams(options.query).toString()
      if (q) url += (url.includes("?") ? "&" : "?") + q
    }
    const headers = options.headers instanceof Headers ? options.headers : new Headers(options.headers)
    let body = options.body
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData
    if (body !== undefined && !isFormData && typeof body !== "string" && !(body instanceof Uint8Array) && !(body instanceof ReadableStream)) {
      if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8")
    }
    const res = await this.handle({
      method: options.method ?? "GET",
      url,
      headers,
      body
    })
    return {
      status: res.status,
      statusCode: res.status,
      headers: res.headers,
      body: res.body,
      async json<T = unknown>(): Promise<T> {
        if (typeof res.body === "string") return JSON.parse(res.body) as T
        if (res.body instanceof Response) return (await res.body.json()) as T
        if (res.body instanceof ReadableStream) return (await new Response(res.body).json()) as T
        return res.body as T
      },
      async text(): Promise<string> {
        if (typeof res.body === "string") return res.body
        if (res.body instanceof Response) return await res.body.text()
        if (res.body instanceof ReadableStream) return await new Response(res.body).text()
        if (res.body instanceof Uint8Array) return new TextDecoder().decode(res.body)
        return JSON.stringify(res.body)
      },
      async bytes(): Promise<Uint8Array> {
        if (res.body instanceof Uint8Array) return res.body
        if (typeof res.body === "string") return new TextEncoder().encode(res.body)
        if (res.body instanceof Response) return new Uint8Array(await res.body.arrayBuffer())
        if (res.body instanceof ReadableStream) return new Uint8Array(await new Response(res.body).arrayBuffer())
        return new TextEncoder().encode(JSON.stringify(res.body))
      }
    }
  }

  route(method: string, path: string, handler: Handler<any>, options: RouteOptions<Record<string, unknown>> = {}): this {
    const effectivePath = joinPrefix(this.prefix, path)
    const metadata = compilePath(effectivePath)
    if (this.graph.routes.some((route) => route.method === normalizeMethod(method) && route.path === effectivePath)) {
      throw new Error(`Duplicate route: ${method.toUpperCase()} ${path}`)
    }
    const macroHooks: Hook[] = []
    const macroSchemas: Partial<Record<"bodySchema" | "paramsSchema" | "querySchema" | "headersSchema" | "responseSchema", Schema | undefined>> = {}
    for (const [name, macro] of this.macros) {
      if (options[name] !== true) continue
      if (macro.beforeHandle) macroHooks.push(macro.beforeHandle)
      if (macro.body !== undefined) macroSchemas.bodySchema = this.resolveSchema(macro.body)
      if (macro.params !== undefined) macroSchemas.paramsSchema = this.resolveSchema(macro.params)
      if (macro.query !== undefined) macroSchemas.querySchema = this.resolveSchema(macro.query)
      if (macro.headers !== undefined) macroSchemas.headersSchema = this.resolveSchema(macro.headers)
      if (macro.response !== undefined) macroSchemas.responseSchema = this.resolveSchema(macro.response)
    }
    const route = {
      method: normalizeMethod(method),
      path: effectivePath,
      ...metadata,
      handler,
      requestHooks: [...this.requestHooks],
      parseHooks: [...this.parseHooks],
      mapResponseHooks: [...this.mapResponseHooks],
      afterResponseHooks: [...this.afterResponseHooks],
      hooks: [...this.contextExtensionHooks, ...this.transformHooks, ...this.hooks, ...macroHooks],
      afterHooks: [...this.afterHooks],
      errorHandlers: [...this.errorHandlers],
      routeGuards: this.routeGuardsFor(options.auth),
      summary: options.summary,
      description: options.description,
      tags: options.tags,
      auth: options.auth,
       bodySchema: this.resolveSchema(options.body) ?? macroSchemas.bodySchema,
       paramsSchema: this.resolveSchema(options.params) ?? macroSchemas.paramsSchema,
       querySchema: this.resolveSchema(options.query) ?? macroSchemas.querySchema,
       headersSchema: this.resolveSchema(options.headers) ?? macroSchemas.headersSchema,
       responseSchema: this.resolveSchema(options.response) ?? macroSchemas.responseSchema,
       bodyModel: modelName(options.body),
       paramsModel: modelName(options.params),
       queryModel: modelName(options.query),
       headersModel: modelName(options.headers),
       responseModel: modelName(options.response),
       responseSchemas: this.resolveResponseSchemas(options.responses),
       responseModels: modelNames(options.responses)
    }
    this.registerRoute(route)
    return this
  }

  private registerRoute(route: RouteRecord): void {
    this.graph.routes.push(route)
    if (route.static) {
      this.staticRoutes.set(`${route.method} ${route.path}`, route)
      return
    }
    const list = this.dynamicRoutes.get(route.method)
    if (list) list.push(route)
    else this.dynamicRoutes.set(route.method, [route])
  }

  private createContext(request: RequestData, params: Record<string, string>, search: string, method: string): { context: Context; responseHeaders: Headers } {
    const headers = asHeaders(request.headers)
    let requestId = ""
    if (this.requestIdEnabled) {
      requestId = request.requestId ?? headers.get("x-request-id") ?? `req-${method}-${request.url}`
    }
    const responseHeaders = new Headers()
    if (this.requestIdEnabled) responseHeaders.set("x-request-id", requestId)
    const clientIp = this.trustedProxy ? headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.remoteAddress : request.remoteAddress
    const context: Context = {
      request: { ...request, headers },
      requestId,
      clientIp,
      env: request.env,
      executionContext: request.executionContext,
      params,
      query: createParsedQuery(search),
      set: { status: undefined, headers: {} },
      store: Object.fromEntries(this.contextValues),
      body: request.body,
      headers,
      signal: request.signal ?? defaultSignal,
      cookies: lazyCookies(headers),
      setCookie: (name, value, options) => responseHeaders.append("set-cookie", serializeCookie(name, value, this.secureCookies ? { ...options, secure: options?.secure ?? true } : options)),
      deleteCookie: (name, options) => responseHeaders.append("set-cookie", serializeCookie(name, "", { ...options, maxAge: 0, path: options?.path ?? "/" })),
      response: (status, body, extraHeaders) => ({ status, body, headers: mergeHeaders(responseHeaders, extraHeaders), [responseMarker]: true }),
      html: (body, status = 200) => ({ status, body, headers: mergeHeaders(responseHeaders, { "content-type": "text/html; charset=utf-8" }), [responseMarker]: true }),
      text: (body, status = 200) => ({ status, body, headers: mergeHeaders(responseHeaders, { "content-type": "text/plain; charset=utf-8" }), [responseMarker]: true }),
      json: (body, status = 200) => ({ status, body, headers: mergeHeaders(responseHeaders, { "content-type": "application/json; charset=utf-8" }), [responseMarker]: true }),
      redirect: (url, status = 302) => ({ status, body: undefined, headers: mergeHeaders(responseHeaders, { location: url }), [responseMarker]: true }),
      header: (name, value) => {
        context.set.headers[name.toLowerCase()] = value
        return context
      }
    }
    for (const [name, value] of this.contextValues) {
      if (typeof value === "function") (context as Record<string, unknown>)[name] = (value as (context: Context) => unknown)(context)
      else (context as Record<string, unknown>)[name] = value
    }
    return { context, responseHeaders }
  }

  private addContextExtension(extension: ContextExtension): void {
    const apply = async (context: Context) => {
      const values = await extension(context)
      if (values) Object.assign(context, values)
    }
    this.contextExtensionHooks.push(apply)
    for (const route of this.graph.routes) route.hooks.splice(this.contextExtensionHooks.length - 1, 0, apply)
  }

  private describeModule(seen: Set<Nelysia<any>>, parent?: string): ModuleGraphNode {
    if (seen.has(this)) return { name: this.name, seed: this.seed, parent, dependencies: [], routeOwnership: [], lifecycleOwnership: 0, loadState: "loaded" }
    const next = new Set(seen).add(this)
    const dependencyNodes = [...this.moduleDependencies].map((dependency) => dependency.describeModule(next, this.name))
    const dependencyState = dependencyNodes.some((dependency) => dependency.loadState === "rejected")
      ? "rejected"
      : dependencyNodes.some((dependency) => dependency.loadState === "pending") ? "pending" : this.moduleState
    return {
      name: this.name,
      seed: this.seed,
      ...(parent === undefined ? {} : { parent }),
      dependencies: dependencyNodes,
      routeOwnership: this.graph.routes.map((route) => `${route.method} ${route.path}`),
      lifecycleOwnership: this.hooks.length + this.requestHooks.length + this.parseHooks.length + this.mapResponseHooks.length + this.afterHooks.length + this.afterResponseHooks.length + this.errorHandlers.length,
      loadState: dependencyState,
      ...(this.moduleLoadError === undefined ? {} : { loadError: this.moduleLoadError })
    }
  }

  private async waitForModules(): Promise<void> {
    let completed = 0
    while (completed < this.modulePromises.length) {
      const pending = this.modulePromises.slice(completed)
      await Promise.all(pending)
      completed += pending.length
    }
  }

  private dependsOn(target: Nelysia<any>, seen = new Set<Nelysia<any>>()): boolean {
    if (this === target) return true
    if (seen.has(this)) return false
    seen.add(this)
    for (const dependency of this.moduleDependencies) if (dependency.dependsOn(target, seen)) return true
    return false
  }

  private resolveSchema(schema: SchemaInput | undefined): Schema | undefined {
    if (schema === undefined) return undefined
    if (typeof schema === "string") {
      const model = this.models.get(schema)
      if (!model) throw new Error(`Unknown model: ${schema}`)
      return normalizeSchema(model)
    }
    return normalizeSchema(schema)
  }

  private resolveResponseSchemas(responses: Record<string | number, SchemaInput> | undefined): Record<string, Schema> | undefined {
    if (responses === undefined) return undefined
    const resolved: Record<string, Schema> = {}
    for (const [status, schema] of Object.entries(responses)) {
      const value = this.resolveSchema(schema)
      if (value !== undefined) resolved[status] = value
    }
    return resolved
  }

  private applyGuard(child: Nelysia<any>, options: GuardOptions<any>): void {
    for (const route of child.graph.routes) {
      if (options.body !== undefined && route.bodySchema === undefined) route.bodySchema = child.resolveSchema(options.body)
      if (options.params !== undefined && route.paramsSchema === undefined) route.paramsSchema = child.resolveSchema(options.params)
      if (options.query !== undefined && route.querySchema === undefined) route.querySchema = child.resolveSchema(options.query)
      if (options.headers !== undefined && route.headersSchema === undefined) route.headersSchema = child.resolveSchema(options.headers)
      if (options.response !== undefined && route.responseSchema === undefined) route.responseSchema = child.resolveSchema(options.response)
      if (options.beforeHandle !== undefined) route.hooks.push(options.beforeHandle)
    }
  }

  async handle(request: RequestData): Promise<ResponseData> {
    await this.waitForModules()
    const { pathname, search } = splitUrl(request.url)
    const method = fastNormalizeMethod(request.method)
    if (method === undefined) return this.response(400, { error: "Unsupported HTTP method" })
    const mounted = this.fetchMounts.find((entry) => matchesMount(entry.prefix, pathname))
    if (mounted !== undefined) {
      const target = new Request(toAbsoluteUrl(request.url), {
        method: request.method,
        headers: request.headers,
        body: request.body === undefined || request.body instanceof ReadableStream || request.body instanceof Uint8Array || typeof request.body === "string"
          ? request.body as BodyInit | null | undefined
          : JSON.stringify(request.body)
      })
      const mountedResponse = await mounted.handler(target)
      return { status: mountedResponse.status, headers: new Headers(mountedResponse.headers), body: mountedResponse, [responseMarker]: true }
    }
    const lookupMethod = method === "HEAD" ? "GET" : method
    const normalized = normalizePathname(pathname)
    // OPTIONS is a cold path: preserve the original 204-with-Allow contract first, unless handled by hooks (e.g. CORS preflight).
    if (method === "OPTIONS") {
      const actual = splitSegments(normalized)
      const allow = allowedMethodsFor(this.graph.routes, actual)
      if (this.hooks.length > 0) {
        const { context } = this.createContext(request, {}, search, method)
        for (const hook of this.hooks) {
          const result = await hook(context)
          if (isResponse(result)) return result
          if (result instanceof Response) return responseFromNative(result, context.set)
        }
      }
      return allow !== "OPTIONS"
        ? this.response(204, undefined, { allow })
        : this.response(404, { error: "Not Found" })
    }
    // Hot path: O(1) static hit, single-split dynamic lookup within one method.
    const directRoute = this.staticRoutes.get(`${lookupMethod} ${normalized}`)
    let route: RouteRecord | undefined
    let params: Record<string, string>
    if (directRoute !== undefined) {
      route = directRoute
      params = {}
    } else {
      const actual = splitSegments(normalized)
      const match = lookupDynamicRoute(this.dynamicRoutes.get(lookupMethod) ?? EMPTY_ROUTES, actual)
      if (match === undefined) {
        // Cold paths only: 404 / 405. Never scanned on a matched request.
        const allow = allowedMethodsFor(this.graph.routes, actual)
        if (allow !== "OPTIONS") {
          return this.response(405, { error: "Method Not Allowed" }, { allow })
        }
        if (this.notFoundHandler !== undefined) {
          const { context, responseHeaders } = this.createContext(request, {}, search, method)
          const result = await this.notFoundHandler(context)
          if (isResponse(result)) return result
          if (result instanceof Response) {
            return {
              status: context.set.status ?? result.status,
              headers: mergeHeaders(mergeHeaders(responseHeaders, Object.fromEntries(result.headers.entries())), context.set.headers),
              body: result.body,
              [responseMarker]: true as const
            }
          }
          const effectiveStatus = context.set.status ?? 404
          const effectiveHeaders = Object.keys(context.set.headers).length > 0 ? mergeHeaders(responseHeaders, context.set.headers) : responseHeaders
          return { status: effectiveStatus, body: result, headers: effectiveHeaders, [responseMarker]: true as const }
        }
        return this.response(404, { error: "Not Found" })
      }
      route = match.route
      params = match.params
    }
    const hasTelemetry = this.telemetry !== undefined
    const startedAt = hasTelemetry ? performance.now() : 0
    const { context, responseHeaders } = this.createContext(request, params, search, method)
    const requestId = context.requestId
    try {
      await this.emitTelemetryEvent({ phase: "request.start", requestId, method, route: route.path, durationMs: this.telemetryDuration(startedAt) })
      let parsedRequest = request
      await this.emitTelemetryEvent({ phase: "route.matched", requestId, method, route: route.path, durationMs: this.telemetryDuration(startedAt) })
      for (const hook of route.requestHooks ?? []) {
        const result = await hook(parsedRequest)
        if (isResponse(result)) return result
        if (result instanceof Response) return responseFromNative(result, context.set)
      }
      for (const guard of route.routeGuards ?? []) {
        const result = await guard(context)
        if (isResponse(result)) return result
        if (result instanceof Response) return responseFromNative(result, context.set)
      }
      await this.emitTelemetryEvent({ phase: "parse", requestId, method, route: route.path, durationMs: this.telemetryDuration(startedAt) })
      for (const hook of route.parseHooks ?? []) {
        const parsed = await hook(parsedRequest, parsedRequest.headers?.get("content-type") ?? null)
        if (parsed !== undefined) {
          parsedRequest = { ...parsedRequest, body: parsed }
          context.body = parsed
        }
      }
      await this.telemetry?.onRequest?.(context)
      if (route.paramsSchema) context.params = await route.paramsSchema.validate(context.params) as Record<string, string>
      if (route.querySchema) context.query = asParsedQuery(await route.querySchema.validate(Object.fromEntries(context.query.entries())))
      if (route.headersSchema) context.headers = await route.headersSchema.validate(Object.fromEntries(context.headers.entries())) as Headers
      if (route.bodySchema) context.body = await route.bodySchema.validate(context.body)
      for (const hook of route.hooks) {
        const result = await hook(context)
        if (isResponse(result)) return result
        if (result instanceof Response) return responseFromNative(result, context.set)
      }
      await this.emitTelemetryEvent({ phase: "handler", requestId, method, route: route.path, durationMs: this.telemetryDuration(startedAt) })
      const result = context.executionControl === undefined
        ? await route.handler(context)
        : await context.executionControl.invoke(() => route.handler(context))
      const effectiveHeaders = Object.keys(context.set.headers).length > 0 ? mergeHeaders(responseHeaders, context.set.headers) : responseHeaders
       let response = isResponse(result)
        ? (context.set.status !== undefined && result.status === 200 ? { ...result, status: context.set.status, headers: mergeHeaders(result.headers, context.set.headers) } : (Object.keys(context.set.headers).length > 0 ? { ...result, headers: mergeHeaders(result.headers, context.set.headers) } : result))
        : result instanceof Response
        ? { status: context.set.status ?? result.status, headers: mergeHeaders(effectiveHeaders, Object.fromEntries(result.headers.entries())), body: result.body, [responseMarker]: true as const }
        : { status: context.set.status ?? 200, body: result, headers: effectiveHeaders, [responseMarker]: true as const }
       const responseSchema = route.responseSchemas?.[String(response.status)] ?? route.responseSchemas?.default ?? (response.status === 200 ? route.responseSchema : undefined)
       if (responseSchema) response.body = await responseSchema.validate(response.body, "response")
        for (const hook of uniqueIdentity([...(route.mapResponseHooks ?? []), ...this.mapResponseHooks.filter((hook) => !this.localMapResponseHooks.includes(hook))])) {
         const mapped = await hook(context, response)
         if (isResponse(mapped)) response = mapped
         else if (mapped !== undefined) response.body = mapped
       }
       for (const hook of route.afterHooks) await hook(context, response)
       await this.telemetry?.onResponse?.(context, response)
       await this.emitTelemetryEvent({ phase: "response", requestId, method, route: route.path, status: response.status, durationMs: this.telemetryDuration(startedAt) })
       await this.exportTelemetrySpan({ name: `${method} ${route.path}`, requestId, method, route: route.path, status: response.status, durationMs: hasTelemetry ? performance.now() - startedAt : 0 })
        for (const hook of uniqueIdentity([...(route.afterResponseHooks ?? []), ...this.afterResponseHooks.filter((hook) => !this.localAfterResponseHooks.includes(hook))])) await hook(context, response)
       await this.emitTelemetryEvent({ phase: "after.response", requestId, method, route: route.path, status: response.status, durationMs: this.telemetryDuration(startedAt) })
      return response
    } catch (error) {
      await this.telemetry?.onError?.(context, error)
      const errorStatus = error instanceof HttpError ? error.status : 500
      await this.emitTelemetryEvent({ phase: "error", requestId, method, route: route.path, status: errorStatus, durationMs: this.telemetryDuration(startedAt), error })
      await this.exportTelemetrySpan({ name: `${method} ${route.path}`, requestId, method, route: route.path, status: errorStatus, durationMs: hasTelemetry ? performance.now() - startedAt : 0, error })
      context.set.status = errorStatus
      for (const handler of route.errorHandlers) {
        const result = await handler(error, context)
        if (isResponse(result)) return result
        if (result instanceof Response) {
          return responseFromNative(result, context.set, responseHeaders)
        }
        if (result !== undefined) {
          return {
            status: context.set.status ?? errorStatus,
            body: result,
            headers: mergeHeaders(responseHeaders, context.set.headers),
            [responseMarker]: true as const
          }
        }
      }
      if (error instanceof HttpError) {
        return this.response(errorStatus, { error: error.message })
      }
      throw error
    } finally {
      context.executionControl?.cleanup()
    }
  }

  /** Adapter boundary for failures that occur before `handle()` can receive a
   * parsed body (for example malformed JSON or a body-limit rejection). */
  async handleAdapterError(error: unknown, request: RequestData): Promise<ResponseData> {
    const { pathname, search } = splitUrl(request.url)
    const method = fastNormalizeMethod(request.method) ?? "GET"
    const lookupMethod = method === "HEAD" ? "GET" : method
    const normalized = normalizePathname(pathname)
    const direct = this.staticRoutes.get(`${lookupMethod} ${normalized}`)
    const match = direct === undefined ? lookupDynamicRoute(this.dynamicRoutes.get(lookupMethod) ?? EMPTY_ROUTES, splitSegments(normalized)) : undefined
    const route = direct ?? match?.route
    const { context, responseHeaders } = this.createContext(request, match?.params ?? {}, search, method)
    const errorStatus = error instanceof HttpError ? error.status : 500
    context.set.status = errorStatus
    await this.telemetry?.onError?.(context, error)
    await this.exportTelemetrySpan({ name: `${method} ${route?.path ?? pathname}`, requestId: context.requestId, method, route: route?.path ?? pathname, status: errorStatus, durationMs: 0, error })
    const handlers = route?.errorHandlers ?? this.errorHandlers
    for (const handler of uniqueIdentity(handlers)) {
      const result = await handler(error, context)
      if (isResponse(result)) return result
      if (result instanceof Response) return responseFromNative(result, context.set, responseHeaders)
      if (result !== undefined) return { status: context.set.status ?? 500, body: result, headers: mergeHeaders(responseHeaders, context.set.headers), [responseMarker]: true }
    }
    const status = errorStatus
    return this.response(status, { error: status === 500 ? "Internal Server Error" : error instanceof Error ? error.message : "Bad Request" }, Object.fromEntries(responseHeaders.entries()))
  }

  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData {
    return { status, body, headers: new Headers(headers), [responseMarker]: true }
  }

  private async exportTelemetrySpan(span: import("./types.ts").TelemetrySpan): Promise<void> {
    try {
      await this.telemetry?.exportSpan?.(span)
    } catch {
      // Exporters are observational. A collector outage must not change the
      // application response or send the request through error handling.
    }
  }

  private telemetryDuration(startedAt: number): number {
    return this.telemetry === undefined ? 0 : performance.now() - startedAt
  }

  private async emitTelemetryEvent(event: import("./types.ts").TelemetryEvent): Promise<void> {
    try {
      await this.telemetry?.onEvent?.(event)
    } catch {
      // Observability callbacks are non-authoritative and must not alter the request result.
    }
  }
}

type PendingServer = Promise<unknown> & {
  close(callback?: () => void): void
  stop(): void
}

function attachServerControls(promise: Promise<unknown>): PendingServer {
  const pending = promise as PendingServer
  pending.close = (callback) => {
    void promise.then((server) => {
      const value = server as { close?: (done?: () => void) => void; stop?: () => void } | undefined
      if (typeof value?.close === "function") value.close(callback)
      else {
        value?.stop?.()
        callback?.()
      }
    }, () => callback?.())
  }
  pending.stop = () => {
    void promise.then((server) => {
      const value = server as { close?: () => void; stop?: () => void } | undefined
      if (typeof value?.stop === "function") value.stop()
      else value?.close?.()
    })
  }
  return pending
}

const EMPTY_ROUTES: RouteRecord[] = []

function fastNormalizeMethod(method: string): RouteRecord["method"] | undefined {
  switch (method) {
    case "GET":
    case "POST":
    case "PUT":
    case "PATCH":
    case "DELETE":
    case "OPTIONS":
    case "HEAD":
      return method
    default:
      try {
        return normalizeMethod(method)
      } catch {
        return undefined
      }
  }
}

function lazyCookies(headers: Headers): Record<string, string> {
  const value = headers.get("cookie")
  if (!value) return {}
  return parseCookies(value)
}

function normalizeSchema(schema: Schema | StandardSchema | undefined): Schema | undefined {
  if (!schema) return undefined
  if ("~standard" in schema) return fromStandardSchema(schema)
  return "validate" in schema ? schema : fromStandardSchema(schema)
}

function splitUrl(input: string): { pathname: string; search: string } {
  let value = input
  const scheme = value.indexOf("://")
  if (scheme !== -1) {
    const slash = value.indexOf("/", scheme + 3)
    value = slash === -1 ? "/" : value.slice(slash)
  }
  const queryIndex = value.indexOf("?")
  return queryIndex === -1
    ? { pathname: value || "/", search: "" }
    : { pathname: value.slice(0, queryIndex) || "/", search: value.slice(queryIndex + 1) }
}

export { HttpError }

function isResponse(value: unknown): value is ResponseData {
  return typeof value === "object" && value !== null && (value as ResponseData)[responseMarker] === true
}

function responseFromNative(response: Response, set?: { status?: number; headers: Record<string, string> }, base?: Headers): ResponseData {
  const headers = mergeHeaders(base ?? new Headers(), Object.fromEntries(response.headers.entries()))
  for (const [key, value] of Object.entries(set?.headers ?? {})) headers.set(key, value)
  return {
    status: set?.status ?? response.status,
    headers,
    body: response,
    [responseMarker]: true
  }
}

function parseCookies(value: string | null): Record<string, string> {
  if (!value) return {}
  return Object.fromEntries(value.split(";").map((part) => {
    const index = part.indexOf("=")
    if (index === -1) return [part.trim(), ""]
    const raw = part.slice(index + 1).trim()
    try { return [part.slice(0, index).trim(), decodeURIComponent(raw)] } catch { return [part.slice(0, index).trim(), raw] }
  }))
}

function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  let output = `${name}=${encodeURIComponent(value)}`
  if (options.maxAge !== undefined) output += `; Max-Age=${options.maxAge}`
  if (options.path) output += `; Path=${options.path}`
  if (options.httpOnly) output += "; HttpOnly"
  if (options.secure) output += "; Secure"
  if (options.sameSite) output += `; SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`
  return output
}

function mergeHeaders(base: Headers, extra?: Record<string, string>): Headers {
  const headers = new Headers(base)
  for (const [key, value] of Object.entries(extra ?? {})) headers.set(key, value)
  return headers
}

function uniqueHooks(hooks: Hook[]): Hook[] {
  return uniqueIdentity(hooks)
}

function uniqueIdentity<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function isNelysia(value: unknown): value is Nelysia {
  return value instanceof Nelysia
}

function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function"
}

function isPluginWrapper(value: unknown): value is { default?: Plugin; app?: Plugin } {
  return typeof value === "object" && value !== null && ("default" in value || "app" in value)
}

function stableSeed(seed: unknown): string {
  if (seed === undefined) return "default"
  try { return JSON.stringify(seed) } catch { return String(seed) }
}

function stableSchema(schema: Schema | StandardSchema): string {
  try {
    const value = schema as unknown as Record<string, unknown>
    return JSON.stringify(value.definition ?? value.shape ?? value._def ?? value) ?? String(schema)
  } catch {
    return String(schema)
  }
}

function hasCircularSchemaDefinition(schema: Schema | StandardSchema): boolean {
  const root = schema as unknown as Record<string, unknown>
  const definition = "definition" in root && root.definition !== undefined ? root.definition : schema
  if (definition === undefined) return false
  const active = new Set<object>()
  const visit = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null) return false
    if (active.has(value)) return true
    active.add(value)
    for (const child of Object.values(value as Record<string, unknown>)) if (visit(child)) return true
    active.delete(value)
    return false
  }
  return visit(definition)
}

function modelName(schema: SchemaInput | undefined): string | undefined {
  return typeof schema === "string" ? schema : undefined
}

function modelNames(responses: Record<string | number, SchemaInput> | undefined): Record<string, string> | undefined {
  if (responses === undefined) return undefined
  const names: Record<string, string> = {}
  for (const [status, schema] of Object.entries(responses)) if (typeof schema === "string") names[status] = schema
  return Object.keys(names).length > 0 ? names : undefined
}

function matchesMount(prefix: string, pathname: string): boolean {
  return prefix === "" || pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function toAbsoluteUrl(url: string): string {
  return url.includes("://") ? url : `http://localhost${url.startsWith("/") ? url : `/${url}`}`
}

function normalizePrefix(prefix = ""): string {
  if (prefix === "" || prefix === "/") return ""
  const value = prefix.startsWith("/") ? prefix : `/${prefix}`
  return value.replace(/\/+$/, "")
}

function joinPrefix(prefix: string, path: string): string {
  const routePath = path.startsWith("/") ? path : `/${path}`
  const joined = `${prefix}${routePath === "/" ? "" : routePath}`.replace(/\/+/g, "/")
  return joined || "/"
}

export function createParsedQuery(search: string): ParsedQuery {
  const params = search === "" ? new URLSearchParams() : new URLSearchParams(search)
  return new Proxy(params, {
    get(target, prop, receiver) {
      if (typeof prop === "symbol" || prop in target) {
        const val = Reflect.get(target, prop, receiver)
        return typeof val === "function" ? val.bind(target) : val
      }
      return target.get(String(prop)) ?? undefined
    },
    has(target, prop) {
      if (typeof prop === "symbol") return Reflect.has(target, prop)
      return target.has(String(prop)) || prop in target
    },
    ownKeys(target) {
      return Array.from(new Set([...Reflect.ownKeys(target), ...target.keys()]))
    },
    getOwnPropertyDescriptor(target, prop) {
      if (typeof prop === "string" && target.has(prop)) {
        return {
          enumerable: true,
          configurable: true,
          writable: true,
          value: target.get(prop) ?? undefined,
        }
      }
      return Reflect.getOwnPropertyDescriptor(target, prop)
    }
  }) as ParsedQuery
}

export function asParsedQuery(source: unknown): ParsedQuery {
  if (typeof source === "string") return createParsedQuery(source)
  if (source instanceof URLSearchParams) return createParsedQuery(source.toString())
  if (typeof source === "object" && source !== null) {
    const entries = Object.entries(source).map(([k, v]) => [k, String(v ?? "")])
    const params = new URLSearchParams(entries)
    return new Proxy(source as Record<string, unknown>, {
      get(target, prop, receiver) {
        if (prop === "get") return (key: string) => params.get(key)
        if (prop === "has") return (key: string) => params.has(key)
        if (prop === "entries") return () => params.entries()
        if (prop === "keys") return () => params.keys()
        if (prop === "values") return () => params.values()
        if (prop === "toString") return () => params.toString()
        if (typeof prop === "symbol" || prop in target) {
          return Reflect.get(target, prop, receiver)
        }
        return params.get(String(prop)) ?? undefined
      }
    }) as unknown as ParsedQuery
  }
  return createParsedQuery("")
}
