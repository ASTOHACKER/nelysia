import { allowedMethodsFor, compilePath, lookupDynamicPath, lookupDynamicUrl, matchSingleDynamicPath, matchSingleDynamicUrl, normalizeMethod, normalizePathname, splitSegments } from "./router.ts"
import { fromStandardSchema, type Schema, type StandardSchema } from "./schema.ts"
import { HttpError, responseMarker, type AddRoute, type AfterHook, type AfterResponseHook, type ApplyGuard, type AuthStrategyDescriptor, type AuthStrategySetting, type AuthStrategyProvider, type Context, type ContextExtension, type CookieOptions, type DecorationOptions, type ErrorHandler, type FetchHandler, type GuardOptions, type Handler, type Hook, type HookOptions, type HookScope, type InjectOptions, type InjectResponse, type InjectResponseBodyFor, type InjectResponseStatusesFor, type MacroDefinition, type MapResponseHook, type MergeRouteMaps, type ModelValues, type ModuleGraphNode, type NormalizedRouteMetadata, type NelysiaOptions, type NelysiaPlugin, type ParseHook, type ParsedQuery, type RateLimitRouteOptions, type RequestData, type RequestHook, type ResponseData, type ResponseOptions, type RouteContext, type RouteFeatureProvider, type RouteGraph, type RouteGuard, type RouteMap, type RouteMetadataOptions, type RouteOptions, type RouteRecord, type SchemaInput, type ServerInfo, type Telemetry, type TransformHook, type TypedInjectOptions, type WebSocketHandlers } from "./types.ts"
import { createExecutionPlan, isThenable, registerRuntimeExecutor, type ExecutionPlan, type PreparedRequest, type RuntimeExecutor } from "./execution.ts"
import { createBunServer } from "../../runtime-bun/src/server.ts"

const asHeaders = (headers?: Headers): Headers => headers ?? new Headers()
const defaultSignal = new AbortController().signal
const sharedEmptyResponseHeaders = new Headers()
const sharedNativeJsonHeaders = new Headers({ "content-type": "application/json; charset=utf-8" })
const lazyFullContextStateSymbol = Symbol("nelysia.lazy-context-state")
const lazyFullContextPrototype = Object.create(Object.prototype) as Record<PropertyKey, unknown>

interface LazyFullContextState {
  readonly search: string
  readonly headers: Headers
  readonly responseHeaders: Headers
  readonly secureCookies: boolean
  readonly stateValues: ReadonlyMap<string, unknown>
  routeSource?: RouteRecord
  route?: Context["route"]
  query?: ParsedQuery
  store?: Record<string, unknown>
  cookies?: Record<string, string>
  setCookie?: Context["setCookie"]
  deleteCookie?: Context["deleteCookie"]
  response?: Context["response"]
  html?: Context["html"]
  text?: Context["text"]
  json?: Context["json"]
  redirect?: Context["redirect"]
  header?: Context["header"]
}

function lazyFullContextState(context: object): LazyFullContextState {
  const state = (context as { [lazyFullContextStateSymbol]?: LazyFullContextState })[lazyFullContextStateSymbol]
  if (state === undefined) throw new Error("Nelysia context state is unavailable")
  return state
}

Object.defineProperties(lazyFullContextPrototype, {
  query: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const state = lazyFullContextState(this)
      return state.query ??= (state.search === "" ? new URLSearchParams() : createParsedQuery(state.search)) as ParsedQuery
    },
    set(this: Context, value: ParsedQuery) { lazyFullContextState(this).query = value }
  },
  store: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const state = lazyFullContextState(this)
      return state.store ??= Object.fromEntries(state.stateValues)
    },
    set(this: Context, value: Record<string, unknown>) { lazyFullContextState(this).store = value }
  },
  cookies: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const state = lazyFullContextState(this)
      return state.cookies ??= lazyCookies(state.headers)
    },
    set(this: Context, value: Record<string, string>) { lazyFullContextState(this).cookies = value }
  },
  setCookie: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const context = this
      const state = lazyFullContextState(context)
      return state.setCookie ??= ((name, value, options) => state.responseHeaders.append("set-cookie", serializeCookie(name, value, state.secureCookies ? { ...options, secure: options?.secure ?? true } : options))) as Context["setCookie"]
    },
    set(this: Context, value: Context["setCookie"]) { lazyFullContextState(this).setCookie = value }
  },
  deleteCookie: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const state = lazyFullContextState(this)
      return state.deleteCookie ??= ((name, options) => state.responseHeaders.append("set-cookie", serializeCookie(name, "", { ...options, maxAge: 0, path: options?.path ?? "/" }))) as Context["deleteCookie"]
    },
    set(this: Context, value: Context["deleteCookie"]) { lazyFullContextState(this).deleteCookie = value }
  },
  response: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const state = lazyFullContextState(this)
      return state.response ??= ((bodyOrStatus: unknown, optionsOrBody?: unknown, extraHeaders?: Record<string, string>) => createContextResponse(state.responseHeaders, bodyOrStatus, optionsOrBody, extraHeaders)) as Context["response"]
    },
    set(this: Context, value: Context["response"]) { lazyFullContextState(this).response = value }
  },
  html: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const state = lazyFullContextState(this)
      return state.html ??= ((body: string, status = 200) => ({ status, body, headers: mergeHeaders(state.responseHeaders, { "content-type": "text/html; charset=utf-8" }), [responseMarker]: true })) as Context["html"]
    },
    set(this: Context, value: Context["html"]) { lazyFullContextState(this).html = value }
  },
  text: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const state = lazyFullContextState(this)
      return state.text ??= ((body: string, status = 200) => ({ status, body, headers: mergeHeaders(state.responseHeaders, { "content-type": "text/plain; charset=utf-8" }), [responseMarker]: true })) as Context["text"]
    },
    set(this: Context, value: Context["text"]) { lazyFullContextState(this).text = value }
  },
  json: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const state = lazyFullContextState(this)
      return state.json ??= ((body: unknown, statusOrOptions: number | ResponseOptions = 200) => {
        const options = typeof statusOrOptions === "number" ? { status: statusOrOptions } : statusOrOptions
        return { status: options.status ?? 200, body, headers: mergeHeaders(state.responseHeaders, mergeHeaders(new Headers({ "content-type": "application/json; charset=utf-8" }), options.headers)), [responseMarker]: true }
      }) as Context["json"]
    },
    set(this: Context, value: Context["json"]) { lazyFullContextState(this).json = value }
  },
  redirect: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const state = lazyFullContextState(this)
      return state.redirect ??= ((url: string, status = 302) => ({ status, body: undefined, headers: mergeHeaders(state.responseHeaders, { location: url }), [responseMarker]: true })) as Context["redirect"]
    },
    set(this: Context, value: Context["redirect"]) { lazyFullContextState(this).redirect = value }
  },
  header: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const context = this
      const state = lazyFullContextState(context)
      return state.header ??= ((name: string, value: string) => {
        context.set.headers[name.toLowerCase()] = value
        return context
      }) as Context["header"]
    },
    set(this: Context, value: Context["header"]) { lazyFullContextState(this).header = value }
  },
  route: {
    enumerable: true,
    configurable: true,
    get(this: Context) {
      const state = lazyFullContextState(this)
      if (state.route !== undefined) return state.route
      const source = state.routeSource
      if (source === undefined) return undefined
      return state.route ??= { method: source.method, path: source.path, features: source.features ?? {}, auth: source.auth }
    },
    set(this: Context, value: Context["route"]) {
      const state = lazyFullContextState(this)
      state.routeSource = undefined
      state.route = value
    }
  }
})

function assignContextRoute(context: Context, route: RouteRecord): void {
  const state = (context as { [lazyFullContextStateSymbol]?: LazyFullContextState })[lazyFullContextStateSymbol]
  if (state !== undefined) {
    state.routeSource = route
    state.route = undefined
    return
  }
  context.route = { method: route.method, path: route.path, features: route.features ?? {}, auth: route.auth }
}

type PluginCallback = (app: Nelysia<any, any, any>) => Nelysia<any, any, any> | void | Promise<Nelysia<any, any, any> | void>
type Plugin = Nelysia<any, any, any> | PluginCallback | NelysiaPlugin<any>
type LazyPlugin = Plugin | Promise<Plugin | { default?: Plugin; app?: Plugin }>
type NativeRequestInput = Pick<RequestData, "method" | "url" | "requestId" | "headers"> & { preflight?: RequestData["preflight"] }
type ExtensionsOf<App> = App extends Nelysia<infer Extensions, any, any> ? Extensions : {}
type RoutesOf<App> = App extends Nelysia<any, infer Routes, any> ? Routes : {}
type ModelsOf<App> = App extends Nelysia<any, any, infer Models> ? Models : {}
type MacrosOf<App> = App extends Nelysia<any, any, any, infer Macros> ? Macros : never
type MergeMacroNames<Left extends string, Right extends string> = Left | Right
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

export class Nelysia<Extensions extends Record<string, unknown> = {}, Routes extends RouteMap = {}, Models extends Record<string, unknown> = {}, MacroNames extends string = never> {
  /** Type-only route map bridge used by the standalone client package. */
  declare readonly __nelysiaRouteMap?: Routes
  readonly graph: RouteGraph = { routes: [] }
  readonly prefix: string
  readonly name?: string
  readonly seed?: unknown
  readonly bodyLimit: number
  private readonly routeOptions: RouteMetadataOptions
  private readonly trustedProxy: boolean
  private readonly secureCookies: boolean
  private hooks: Hook[] = []
  private localHooks: Hook[] = []
  private requestHooks: RequestHook[] = []
  private localRequestHooks: RequestHook[] = []
  private scopedRequestHooks: RequestHook[] = []
  private globalRequestHooks: RequestHook[] = []
  private parseHooks: ParseHook[] = []
  private localParseHooks: ParseHook[] = []
  private scopedParseHooks: ParseHook[] = []
  private globalParseHooks: ParseHook[] = []
  private transformHooks: TransformHook[] = []
  private localTransformHooks: TransformHook[] = []
  private scopedTransformHooks: TransformHook[] = []
  private globalTransformHooks: TransformHook[] = []
  private mapResponseHooks: MapResponseHook[] = []
  private localMapResponseHooks: MapResponseHook[] = []
  private scopedMapResponseHooks: MapResponseHook[] = []
  private globalMapResponseHooks: MapResponseHook[] = []
  private afterResponseHooks: AfterResponseHook[] = []
  private localAfterResponseHooks: AfterResponseHook[] = []
  private scopedAfterResponseHooks: AfterResponseHook[] = []
  private globalAfterResponseHooks: AfterResponseHook[] = []
  private scopedHooks: Hook[] = []
  private globalHooks: Hook[] = []
  private afterHooks: AfterHook[] = []
  private localAfterHooks: AfterHook[] = []
  private scopedAfterHooks: AfterHook[] = []
  private globalAfterHooks: AfterHook[] = []
  private errorHandlers: ErrorHandler[] = []
  private localErrorHandlers: ErrorHandler[] = []
  private scopedErrorHandlers: ErrorHandler[] = []
  private globalErrorHandlers: ErrorHandler[] = []
  private readonly contextValues = new Map<string, unknown>()
  private readonly stateValues = new Map<string, unknown>()
  private readonly decorationValues = new Map<string, unknown>()
  private readonly nonEnumerableDecorations = new Set<string>()
  private readonly lazyDecorations = new Set<string>()
  private readonly models = new Map<string, Schema | StandardSchema>()
  private readonly macros = new Map<string, MacroDefinition>()
  private contextExtensionHooks: Hook[] = []
  private readonly usedPlugins = new Set<string>()
  private readonly namedPlugins = new Map<string, string>()
  private readonly moduleDependencies = new Set<Nelysia<any, any, any>>()
  private readonly modulePromises: Promise<void>[] = []
  private moduleCompletion?: Promise<void>
  private moduleState: "loaded" | "pending" | "rejected" = "loaded"
  private moduleLoadError?: unknown
  readonly telemetry?: Telemetry
  readonly websocketRoutes: { path: string; handlers: WebSocketHandlers }[] = []
  private readonly fetchMounts: { prefix: string; handler: FetchHandler }[] = []
  private readonly staticRoutes = new Map<string, RouteRecord>()
  private readonly staticGetRoutes = new Map<string, RouteRecord>()
  private readonly dynamicRoutes = new Map<string, RouteRecord[]>()
  /** Route plans are private composition-time snapshots. The version lets a
   * mutation invalidate every route without adding state to public
   * RouteRecord values. */
  private executionPlanVersion = 0
  private readonly executionPlanCache = new Map<RouteRecord, { version: number; plan: ExecutionPlan }>()
  private readonly mountedRoutes = new Set<RouteRecord>()
  private readonly routeGuardRegistrations: Array<{ guard: RouteGuard; applies: (auth: RouteRecord["auth"]) => boolean }> = []
  private readonly authStrategyProviders = new Map<string, AuthStrategyProvider>()
  private readonly routeFeatureProviders = new Map<string, RouteFeatureProvider>()
  private readonly appliedRouteFeatures = new WeakMap<RouteRecord, Set<string>>()
  private readonly routeFeatureHooks = new WeakMap<RouteRecord, { guards: RouteGuard[]; after: AfterHook[] }>()
  private readonly appliedAuthorization = new WeakSet<RouteRecord>()
  private readonly routeAuthorizationHooks = new WeakMap<RouteRecord, Hook>()
  /** Public so runtime adapters can skip UUID generation when disabled. */
  readonly requestIdEnabled: boolean
  private notFoundHandler?: Handler

  constructor(options: NelysiaOptions = {}) {
    this.prefix = normalizePrefix(options.prefix)
    this.name = options.name
    this.seed = options.seed
    this.routeOptions = options.routeOptions === undefined ? {} : cloneRouteMetadata(options.routeOptions)
    this.bodyLimit = options.bodyLimit ?? 1024 * 1024
    this.telemetry = options.telemetry
    this.trustedProxy = options.trustedProxy ?? false
    this.secureCookies = options.secureCookies ?? false
    this.requestIdEnabled = options.requestId ?? true
    const executor: RuntimeExecutor = {
      preflight: (request) => this.runPreflight(request),
      handle: (request) => this.runHandle(request),
      handleNative: (request) => this.runNativeHandle(request),
      handleNativeRequest: (request, requestId) => this.runNativeHandle(request, requestId)
    }
    registerRuntimeExecutor(this, executor)
  }

  private invalidateExecutionPlans(): void {
    this.executionPlanVersion++
  }

  /** Internal extension point for route-scoped guards such as JWT auth. */
  registerRouteGuard(guard: RouteGuard, applies: (auth: RouteRecord["auth"]) => boolean): this {
    this.invalidateExecutionPlans()
    this.routeGuardRegistrations.push({ guard, applies })
    for (const route of this.graph.routes) {
      if (!applies(route.auth)) continue
      route.routeGuards ??= []
      if (!route.routeGuards.includes(guard)) route.routeGuards.push(guard)
    }
    return this
  }

  /** Register an authentication provider without wrapping handlers. Providers
   * are matched after routing and before parsing/validation. */
  registerAuthStrategy(name: string, provider: AuthStrategyProvider): this {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) throw new Error(`Invalid auth strategy name: ${name}`)
    const existing = this.authStrategyProviders.get(name)
    if (existing !== undefined && existing !== provider) throw new Error(`Conflicting auth strategy provider: ${name}`)
    this.invalidateExecutionPlans()
    this.authStrategyProviders.set(name, provider)
    this.registerRouteGuard(provider.guard, (auth) => authMatchesStrategy(auth, name))
    return this
  }

  /** Register a lazy route feature implementation. A route must declare the
   * feature after its provider is installed; no feature is auto-enabled. */
  registerRouteFeature<Value = unknown>(name: string, provider: RouteFeatureProvider<Value>): this {
    const existing = this.routeFeatureProviders.get(name)
    if (existing !== undefined && existing !== provider) throw new Error(`Conflicting route feature provider: ${name}`)
    this.invalidateExecutionPlans()
    this.routeFeatureProviders.set(name, provider as RouteFeatureProvider)
    for (const route of this.graph.routes) {
      const value = route.features?.[name]
      if (value !== undefined && value !== false) this.applyRouteFeature(route, name, value)
    }
    return this
  }

  private routeGuardsFor(auth: RouteRecord["auth"]): RouteGuard[] {
    return this.routeGuardRegistrations.filter((registration) => registration.applies(auth)).map((registration) => registration.guard)
  }

  private normalizeAuthSetting(auth: AuthStrategySetting | undefined): AuthStrategySetting | undefined {
    if (auth === undefined || auth === false) return auth
    if (auth === "optional") {
      const names = [...this.authStrategyProviders.keys()]
      if (names.length !== 1) throw new Error(`auth optional requires exactly one registered provider; found ${names.length}`)
      return { strategy: names[0] as never, optional: true }
    }
    if (auth === true) {
      // Boolean auth is a deprecated v0.x escape hatch. Keep accepting it so
      // custom route guards registered through registerRouteGuard continue to
      // work; named strategies use the strict provider check below.
      return auth
    }
    const strategy = typeof auth === "string" ? auth : auth.strategy
    if (!this.authStrategyProviders.has(strategy)) throw new Error(`No auth provider registered for strategy "${strategy}"`)
    return auth
  }

  private applyRouteFeature(route: RouteRecord, name: string, value: unknown): void {
    if (value === undefined || value === false) return
    const provider = this.routeFeatureProviders.get(name)
    if (provider === undefined) throw new Error(`No route feature provider registered for "${name}" on ${route.method} ${route.path}`)
    const applied = this.appliedRouteFeatures.get(route) ?? new Set<string>()
    if (applied.has(name)) return
    const generated = this.routeFeatureHooks.get(route) ?? { guards: [], after: [] }
    if (provider.beforeHandle) {
      route.routeGuards ??= []
      const guard = provider.beforeHandle(value)
      route.routeGuards.push(guard)
      generated.guards.push(guard)
    }
    if (provider.afterHandle) {
      const after = provider.afterHandle(value)
      route.afterHooks.push(after)
      generated.after.push(after)
    }
    applied.add(name)
    this.appliedRouteFeatures.set(route, applied)
    this.routeFeatureHooks.set(route, generated)
  }

  private applyRouteFeatures(route: RouteRecord): void {
    for (const [name, value] of Object.entries(route.features ?? {})) this.applyRouteFeature(route, name, value)
  }

  private applyRouteAuthorization(route: RouteRecord): void {
    if (this.appliedAuthorization.has(route) || (route.role === undefined && route.permissions === undefined)) return
    // Authentication providers remain route guards and therefore run before
    // parsing/validation. Authorization is deliberately a normal route hook:
    // role/permission resolvers supplied by `derive()` must run first so a
    // roles provider can build `context.permissions` from the authenticated
    // claims before this policy is evaluated.
    const authorizationHook: Hook = (context) => authorizeRoute(context, route)
    route.hooks.push(authorizationHook)
    this.routeAuthorizationHooks.set(route, authorizationHook)
    this.appliedAuthorization.add(route)
  }

  private inheritProviders(child: Nelysia<any, any, any>): void {
    for (const [name, provider] of this.authStrategyProviders) child.authStrategyProviders.set(name, provider)
    for (const registration of this.routeGuardRegistrations) child.routeGuardRegistrations.push(registration)
    for (const [name, provider] of this.routeFeatureProviders) child.routeFeatureProviders.set(name, provider)
  }

  onBeforeHandle(hook: Hook): this
  onBeforeHandle(options: HookOptions, hook: Hook): this
  onBeforeHandle(optionsOrHook: Hook | HookOptions, maybeHook?: Hook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onBeforeHandle requires a hook")
    this.invalidateExecutionPlans()
    this.hooks.push(hook)
    if (options.as === "local") this.localHooks.push(hook)
    if (options.as === "scoped") this.scopedHooks.push(hook)
    if (options.as === "global") this.globalHooks.push(hook)
    for (const route of this.routesForScope(options.as)) route.hooks.push(hook)
    return this
  }

  onRequest(hook: RequestHook): this
  onRequest(options: HookOptions, hook: RequestHook): this
  onRequest(optionsOrHook: RequestHook | HookOptions, maybeHook?: RequestHook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onRequest requires a hook")
    this.invalidateExecutionPlans()
    this.requestHooks.push(hook)
    if (options.as === "local") this.localRequestHooks.push(hook)
    if (options.as === "scoped") this.scopedRequestHooks.push(hook)
    if (options.as === "global") this.globalRequestHooks.push(hook)
    for (const route of this.routesForScope(options.as)) route.requestHooks?.push(hook)
    return this
  }

  onParse(hook: ParseHook): this
  onParse(options: HookOptions, hook: ParseHook): this
  onParse(optionsOrHook: ParseHook | HookOptions, maybeHook?: ParseHook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onParse requires a hook")
    this.invalidateExecutionPlans()
    this.parseHooks.push(hook)
    if (options.as === "local") this.localParseHooks.push(hook)
    if (options.as === "scoped") this.scopedParseHooks.push(hook)
    if (options.as === "global") this.globalParseHooks.push(hook)
    for (const route of this.routesForScope(options.as)) route.parseHooks?.push(hook)
    return this
  }

  onTransform(hook: TransformHook): this
  onTransform(options: HookOptions, hook: TransformHook): this
  onTransform(optionsOrHook: TransformHook | HookOptions, maybeHook?: TransformHook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onTransform requires a hook")
    this.invalidateExecutionPlans()
    this.transformHooks.push(hook)
    if (options.as === "local") this.localTransformHooks.push(hook)
    if (options.as === "scoped") this.scopedTransformHooks.push(hook)
    if (options.as === "global") this.globalTransformHooks.push(hook)
    for (const route of this.routesForScope(options.as)) route.hooks.unshift(hook)
    return this
  }

  mapResponse(hook: MapResponseHook): this
  mapResponse(options: HookOptions, hook: MapResponseHook): this
  mapResponse(optionsOrHook: MapResponseHook | HookOptions, maybeHook?: MapResponseHook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("mapResponse requires a hook")
    this.invalidateExecutionPlans()
    this.mapResponseHooks.push(hook)
    if (options.as === "local") this.localMapResponseHooks.push(hook)
    if (options.as === "scoped") this.scopedMapResponseHooks.push(hook)
    if (options.as === "global") this.globalMapResponseHooks.push(hook)
    for (const route of this.routesForScope(options.as)) route.mapResponseHooks?.push(hook)
    return this
  }

  onAfterResponse(hook: AfterResponseHook): this
  onAfterResponse(options: HookOptions, hook: AfterResponseHook): this
  onAfterResponse(optionsOrHook: AfterResponseHook | HookOptions, maybeHook?: AfterResponseHook): this {
    const options = typeof optionsOrHook === "function" ? {} : optionsOrHook
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onAfterResponse requires a hook")
    this.invalidateExecutionPlans()
    this.afterResponseHooks.push(hook)
    if (options.as === "local") this.localAfterResponseHooks.push(hook)
    if (options.as === "scoped") this.scopedAfterResponseHooks.push(hook)
    if (options.as === "global") this.globalAfterResponseHooks.push(hook)
    for (const route of this.routesForScope(options.as)) route.afterResponseHooks?.push(hook)
    return this
  }

  as(scope: HookOptions["as"]): this {
    this.invalidateExecutionPlans()
    if (scope === "scoped") {
      for (const hook of this.hooks) if (!this.scopedHooks.includes(hook)) this.scopedHooks.push(hook)
      for (const hook of this.transformHooks) if (!this.scopedTransformHooks.includes(hook)) this.scopedTransformHooks.push(hook)
      for (const hook of this.requestHooks) if (!this.scopedRequestHooks.includes(hook)) this.scopedRequestHooks.push(hook)
      for (const hook of this.parseHooks) if (!this.scopedParseHooks.includes(hook)) this.scopedParseHooks.push(hook)
      for (const hook of this.mapResponseHooks) if (!this.scopedMapResponseHooks.includes(hook)) this.scopedMapResponseHooks.push(hook)
      for (const hook of this.afterResponseHooks) if (!this.scopedAfterResponseHooks.includes(hook)) this.scopedAfterResponseHooks.push(hook)
      for (const hook of this.afterHooks) if (!this.scopedAfterHooks.includes(hook)) this.scopedAfterHooks.push(hook)
      for (const handler of this.errorHandlers) if (!this.scopedErrorHandlers.includes(handler)) this.scopedErrorHandlers.push(handler)
    }
    if (scope === "global") {
      for (const hook of this.hooks) if (!this.globalHooks.includes(hook)) this.globalHooks.push(hook)
      for (const hook of this.transformHooks) if (!this.globalTransformHooks.includes(hook)) this.globalTransformHooks.push(hook)
      for (const hook of this.requestHooks) if (!this.globalRequestHooks.includes(hook)) this.globalRequestHooks.push(hook)
      for (const hook of this.parseHooks) if (!this.globalParseHooks.includes(hook)) this.globalParseHooks.push(hook)
      for (const hook of this.mapResponseHooks) if (!this.globalMapResponseHooks.includes(hook)) this.globalMapResponseHooks.push(hook)
      for (const hook of this.afterResponseHooks) if (!this.globalAfterResponseHooks.includes(hook)) this.globalAfterResponseHooks.push(hook)
      for (const hook of this.afterHooks) if (!this.globalAfterHooks.includes(hook)) this.globalAfterHooks.push(hook)
      for (const handler of this.errorHandlers) if (!this.globalErrorHandlers.includes(handler)) this.globalErrorHandlers.push(handler)
    }
    return this
  }

  onAfterHandle(hook: AfterHook): this
  onAfterHandle(options: HookOptions, hook: AfterHook): this
  onAfterHandle(optionsOrHook: AfterHook | HookOptions, maybeHook?: AfterHook): this {
    const hook = typeof optionsOrHook === "function" ? optionsOrHook : maybeHook
    if (!hook) throw new Error("onAfterHandle requires a hook")
    this.invalidateExecutionPlans()
    this.afterHooks.push(hook)
    if (typeof optionsOrHook !== "function" && optionsOrHook.as === "local") this.localAfterHooks.push(hook)
    if (typeof optionsOrHook !== "function" && optionsOrHook.as === "scoped") this.scopedAfterHooks.push(hook)
    if (typeof optionsOrHook !== "function" && optionsOrHook.as === "global") this.globalAfterHooks.push(hook)
    for (const route of this.routesForScope(typeof optionsOrHook === "function" ? undefined : optionsOrHook.as)) route.afterHooks.push(hook)
    return this
  }

  onError(handler: ErrorHandler): this
  onError(options: HookOptions, handler: ErrorHandler): this
  onError(optionsOrHandler: ErrorHandler | HookOptions, maybeHandler?: ErrorHandler): this {
    const handler = typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler
    if (!handler) throw new Error("onError requires a handler")
    this.invalidateExecutionPlans()
    this.errorHandlers.push(handler)
    if (typeof optionsOrHandler !== "function" && optionsOrHandler.as === "local") this.localErrorHandlers.push(handler)
    if (typeof optionsOrHandler !== "function" && optionsOrHandler.as === "scoped") this.scopedErrorHandlers.push(handler)
    if (typeof optionsOrHandler !== "function" && optionsOrHandler.as === "global") this.globalErrorHandlers.push(handler)
    for (const route of this.routesForScope(typeof optionsOrHandler === "function" ? undefined : optionsOrHandler.as)) route.errorHandlers.push(handler)
    return this
  }

  state<K extends string, Value>(name: K, value: Value): Nelysia<Extensions & { store: Record<K, Value> } & Record<K, Value>, Routes, Models, MacroNames> {
    this.invalidateExecutionPlans()
    this.stateValues.set(name, value)
    this.contextValues.set(name, value)
    return this as unknown as Nelysia<Extensions & { store: Record<K, Value> } & Record<K, Value>, Routes, Models, MacroNames>
  }

  decorate<K extends string, Value>(name: K, value: Value | ((context: Context & Extensions) => Value), options?: DecorationOptions): Nelysia<Extensions & Record<K, Value>, Routes, Models, MacroNames> {
    this.invalidateExecutionPlans()
    this.decorationValues.set(name, value)
    this.contextValues.set(name, value)
    if (options?.enumerable === false) this.nonEnumerableDecorations.add(name)
    if (options?.lazy === true) this.lazyDecorations.add(name)
    return this as unknown as Nelysia<Extensions & Record<K, Value>, Routes, Models, MacroNames>
  }

  derive<Added extends Record<string, unknown>>(extension: (context: Context & Extensions) => Added | void | Promise<Added | void>): Nelysia<Extensions & Added, Routes, Models, MacroNames> {
    this.addContextExtension(extension as ContextExtension)
    return this as unknown as Nelysia<Extensions & Added, Routes, Models, MacroNames>
  }

  resolve<Added extends Record<string, unknown>>(extension: (context: Context & Extensions) => Added | void | Promise<Added | void>): Nelysia<Extensions & Added, Routes, Models, MacroNames> {
    this.addContextExtension(extension as ContextExtension)
    return this as unknown as Nelysia<Extensions & Added, Routes, Models, MacroNames>
  }

  macro<Definitions extends Record<string, MacroDefinition>>(definitions: Definitions): Nelysia<Extensions, Routes, Models, MergeMacroNames<MacroNames, Extract<keyof Definitions, string>>> {
    for (const [name, definition] of Object.entries(definitions)) this.macros.set(name, definition)
    return this as unknown as Nelysia<Extensions, Routes, Models, MergeMacroNames<MacroNames, Extract<keyof Definitions, string>>>
  }

  model<Definitions extends Record<string, Schema | StandardSchema>>(models: Definitions): Nelysia<Extensions, Routes, Models & ModelValues<Definitions>, MacroNames> {
    for (const [name, schema] of Object.entries(models)) {
      if (hasCircularSchemaDefinition(schema)) throw new Error(`Circular model definition: ${name}`)
      const existing = this.models.get(name)
      if (existing !== undefined && stableSchema(existing) !== stableSchema(schema)) throw new Error(`Conflicting model definition: ${name}`)
      this.models.set(name, schema)
    }
    return this as unknown as Nelysia<Extensions, Routes, Models & ModelValues<Definitions>, MacroNames>
  }

  guard<Guard extends GuardOptions<Models>, Child extends Nelysia<any, any, any, any>>(options: Guard, callback: (app: Nelysia<Extensions, Routes, Models, MacroNames>) => Child): Nelysia<Extensions, MergeRouteMaps<Routes, ApplyGuard<RoutesOf<Child>, Guard, Models>>, Models & ModelsOf<Child>, MergeMacroNames<MacroNames, MacrosOf<Child>>>
  guard(options: GuardOptions<Models>, callback: (app: Nelysia<Extensions, Routes, Models, MacroNames>) => void): this
  guard(options: GuardOptions<Models>, callback: (app: Nelysia<any, any, any>) => void): this {
    const child = new Nelysia({
      bodyLimit: this.bodyLimit,
      trustedProxy: this.trustedProxy,
      secureCookies: this.secureCookies,
      requestId: this.requestIdEnabled,
      telemetry: this.telemetry
    })
    this.inheritProviders(child)
    for (const [name, schema] of this.models) child.models.set(name, schema)
    for (const [name, definition] of this.macros) child.macros.set(name, definition)
    callback(child)
    this.applyGuard(child, options)
    this.mount("/", child)
    return this
  }

  notFound(handler: Handler): this {
    this.notFoundHandler = handler
    return this
  }

  use<PluginApp extends Nelysia<any, any, any, any>>(plugin: PluginApp): Nelysia<Extensions & ExtensionsOf<PluginApp>, MergeRouteMaps<Routes, RoutesOf<PluginApp>>, Models & ModelsOf<PluginApp>, MergeMacroNames<MacroNames, MacrosOf<PluginApp>>>
  use<PluginApp extends Nelysia<any, any, any, any>>(plugin: Promise<PluginApp>): Nelysia<Extensions & ExtensionsOf<PluginApp>, MergeRouteMaps<Routes, RoutesOf<PluginApp>>, Models & ModelsOf<PluginApp>, MergeMacroNames<MacroNames, MacrosOf<PluginApp>>>
  use<Added extends object>(plugin: NelysiaPlugin<Added>): Nelysia<Extensions & Added, Routes, Models, MacroNames>
  use<PluginApp extends Nelysia<any, any, any, any>>(plugin: (app: Nelysia<Extensions, Routes, Models, MacroNames>) => PluginApp): Nelysia<Extensions & ExtensionsOf<PluginApp>, MergeRouteMaps<Routes, RoutesOf<PluginApp>>, Models & ModelsOf<PluginApp>, MergeMacroNames<MacroNames, MacrosOf<PluginApp>>>
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
      this.moduleCompletion = undefined
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
        this.moduleCompletion = undefined
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
      this.moduleCompletion = undefined
    }
    return this
  }

  /** Explicit lazy-plugin spelling. `.use(Promise)` remains supported for v0.x compatibility. */
  lazy(loader: () => LazyPlugin): this
  lazy<PluginApp extends Nelysia<any, any, any, any>>(loader: () => PluginApp | Promise<PluginApp>): Nelysia<Extensions & ExtensionsOf<PluginApp>, MergeRouteMaps<Routes, RoutesOf<PluginApp>>, Models & ModelsOf<PluginApp>, MergeMacroNames<MacroNames, MacrosOf<PluginApp>>>
  lazy(loader: () => LazyPlugin): this {
    return this.use(Promise.resolve().then(loader))
  }

  /** Explicit lazy sub-application spelling with a prefix. */
  mountLazy<Prefix extends string, PluginApp extends Nelysia<any, any, any, any>>(prefix: Prefix, loader: () => PluginApp | Promise<PluginApp>): Nelysia<Extensions, MergeRouteMaps<Routes, PrefixRoutes<Prefix, RoutesOf<PluginApp>>>, Models & ModelsOf<PluginApp>, MergeMacroNames<MacroNames, MacrosOf<PluginApp>>>
  mountLazy(prefix: string, loader: () => Nelysia<any, any, any> | FetchHandler | Promise<Nelysia<any, any, any> | FetchHandler>): this
  mountLazy(prefix: string, loader: () => Nelysia<any, any, any> | FetchHandler | Promise<Nelysia<any, any, any> | FetchHandler>): this {
    this.moduleState = "pending"
    const pending = Promise.resolve().then(loader).then((resolved) => {
      if (isNelysia(resolved)) this.mount(prefix, resolved)
      else if (typeof resolved === "function") this.mount(prefix, resolved)
      else throw new Error("Lazy mount must resolve to a Nelysia instance or Fetch handler")
    }).then(() => {
      this.moduleState = "loaded"
    }, (error) => {
      this.moduleState = "rejected"
      this.moduleLoadError = error
      throw error
    })
    this.modulePromises.push(pending)
    this.moduleCompletion = undefined
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

  get usesTrustedProxy(): boolean { return this.trustedProxy }
  get usesSecureCookies(): boolean { return this.secureCookies }
  get hasCustomNotFound(): boolean { return this.notFoundHandler !== undefined }

  get modelDefinitions(): ReadonlyMap<string, Schema | StandardSchema> {
    return this.models
  }

  /** True when per-request state/decorations must be present for contextful handlers. */
  get hasContextValues(): boolean {
    return this.contextValues.size > 0
  }

  get<Path extends string, Options extends RouteOptions<Models, MacroNames> = RouteOptions<Models, MacroNames>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "GET", Path, Options, Result, Models>, Models, MacroNames>
  get<Path extends string, Value>(path: Path, body: Value, options?: RouteOptions<Models, MacroNames>): Nelysia<Extensions, AddRoute<Routes, "GET", Path, RouteOptions<Models, MacroNames>, Value, Models>, Models, MacroNames>
  get(path: string, handlerOrBody: unknown, options?: RouteOptions<Models, MacroNames>): Nelysia<any, any, any, any> {
    if (handlerOrBody instanceof ReadableStream) throw new Error("getStatic(ReadableStream) is not replay-safe; use a handler that creates a new stream per request")
    const app = this.route("GET", path, (typeof handlerOrBody === "function" ? handlerOrBody : () => cloneStaticValue(handlerOrBody)) as Handler<any>, options)
    if (typeof handlerOrBody !== "function") {
      this.graph.routes[this.graph.routes.length - 1].contextFree = true
      this.graph.routes[this.graph.routes.length - 1].staticValue = handlerOrBody
    }
    return app
  }
  getStatic(path: string, body: unknown): this {
    if (body instanceof ReadableStream) throw new Error("getStatic(ReadableStream) is not replay-safe; use a handler that creates a new stream per request")
    this.route("GET", path, () => cloneStaticValue(body))
    this.graph.routes[this.graph.routes.length - 1].contextFree = true
    this.graph.routes[this.graph.routes.length - 1].staticValue = body
    return this
  }
  post<Path extends string, Options extends RouteOptions<Models, MacroNames> = RouteOptions<Models, MacroNames>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "POST", Path, Options, Result, Models>, Models, MacroNames> { return this.route("POST", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "POST", Path, Options, Result, Models>, Models, MacroNames> }
  put<Path extends string, Options extends RouteOptions<Models, MacroNames> = RouteOptions<Models, MacroNames>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "PUT", Path, Options, Result, Models>, Models, MacroNames> { return this.route("PUT", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "PUT", Path, Options, Result, Models>, Models, MacroNames> }
  patch<Path extends string, Options extends RouteOptions<Models, MacroNames> = RouteOptions<Models, MacroNames>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "PATCH", Path, Options, Result, Models>, Models, MacroNames> { return this.route("PATCH", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "PATCH", Path, Options, Result, Models>, Models, MacroNames> }
  delete<Path extends string, Options extends RouteOptions<Models, MacroNames> = RouteOptions<Models, MacroNames>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "DELETE", Path, Options, Result, Models>, Models, MacroNames> { return this.route("DELETE", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "DELETE", Path, Options, Result, Models>, Models, MacroNames> }
  head<Path extends string, Options extends RouteOptions<Models, MacroNames> = RouteOptions<Models, MacroNames>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "HEAD", Path, Options, Result, Models>, Models, MacroNames> { return this.route("HEAD", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "HEAD", Path, Options, Result, Models>, Models, MacroNames> }
  options<Path extends string, Options extends RouteOptions<Models, MacroNames> = RouteOptions<Models, MacroNames>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddRoute<Routes, "OPTIONS", Path, Options, Result, Models>, Models, MacroNames> { return this.route("OPTIONS", path, handler, options) as unknown as Nelysia<Extensions, AddRoute<Routes, "OPTIONS", Path, Options, Result, Models>, Models, MacroNames> }

  all<Path extends string, Options extends RouteOptions<Models, MacroNames> = RouteOptions<Models, MacroNames>, Result = unknown>(path: Path, handler: (context: RouteContext<Extensions, Options, Models>) => Result | Promise<Result>, options?: Options): Nelysia<Extensions, AddAllRoutes<Routes, Path, Options, Result>, Models, MacroNames> {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) this.route(method, path, handler, options)
    return this as unknown as Nelysia<Extensions, AddAllRoutes<Routes, Path, Options, Result>, Models, MacroNames>
  }

  websocket(path: string, handlers: WebSocketHandlers): this {
    this.websocketRoutes.push({ path, handlers })
    return this
  }

  mount<Prefix extends string, Child extends Nelysia<any, any, any, any>>(prefix: Prefix, child: Child): Nelysia<Extensions, MergeRouteMaps<Routes, PrefixRoutes<Prefix, RoutesOf<Child>>>, Models & ModelsOf<Child>, MergeMacroNames<MacroNames, MacrosOf<Child>>>
  mount(prefix: string, handler: FetchHandler): this
  mount(prefix: string, childOrHandler: Nelysia<any, any, any> | FetchHandler): this {
    this.invalidateExecutionPlans()
    if (typeof childOrHandler === "function") {
      this.fetchMounts.push({ prefix: normalizePrefix(prefix), handler: childOrHandler })
      return this
    }
    const child = childOrHandler
    const base = prefix === "/" ? "" : prefix.replace(/\/$/, "")
    // Macro definitions are compile-time keys, but their runtime hooks and
    // schemas are still needed by routes added to the parent after mounting.
    // Copy inherited definitions forward and reject ambiguous replacements.
    for (const [name, definition] of child.macros) {
      const existing = this.macros.get(name)
      if (existing !== undefined && existing !== definition) throw new Error(`Conflicting macro definition: ${name}`)
      this.macros.set(name, definition)
    }
    for (const [name, value] of child.stateValues) {
      if (!this.stateValues.has(name)) this.stateValues.set(name, value)
    }
    for (const [name, value] of child.decorationValues) {
      if (!this.decorationValues.has(name)) this.decorationValues.set(name, value)
    }
    for (const name of child.nonEnumerableDecorations) this.nonEnumerableDecorations.add(name)
    for (const name of child.lazyDecorations) this.lazyDecorations.add(name)
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
      const childMetadata = route.metadata ?? {
        auth: route.auth,
        role: route.role,
        permissions: route.permissions,
        features: route.features
      }
      const inheritedMetadata = mergeRouteMetadata(this.routeOptions, childMetadata)
      const inheritedAuth = this.normalizeAuthSetting(inheritedMetadata.auth)
      const inheritedFeatures = routeFeaturesFrom(inheritedMetadata)
      const childFeatureNames = new Set(Object.keys(route.features ?? {}))
      const childGeneratedFeatureHooks = child.routeFeatureHooks.get(route)
      const rebuiltFeatureNames = new Set(Object.keys(inheritedFeatures).filter((name) => this.routeFeatureProviders.has(name)))
      const mounted: RouteRecord = {
        ...route,
        path,
        ...metadata,
        auth: inheritedAuth,
        role: inheritedMetadata.role ?? authDescriptorValue(inheritedAuth, "role"),
        permissions: inheritedMetadata.permissions ?? authDescriptorValue(inheritedAuth, "permissions"),
        features: inheritedFeatures,
        metadata: undefined,
        hooks: uniqueHooks([
          ...this.contextExtensionHooks,
          ...this.hooks.filter((hook) => !this.localHooks.includes(hook)),
          ...this.transformHooks.filter((hook) => !this.localTransformHooks.includes(hook)),
          ...this.scopedHooks,
          ...this.scopedTransformHooks,
          ...route.hooks.filter((hook) => hook !== child.routeAuthorizationHooks.get(route))
        ]),
        requestHooks: uniqueIdentity([...(route.requestHooks ?? []), ...child.requestHooks, ...this.requestHooks.filter((hook) => !this.localRequestHooks.includes(hook))]),
        parseHooks: uniqueIdentity([...(route.parseHooks ?? []), ...child.parseHooks, ...this.parseHooks.filter((hook) => !this.localParseHooks.includes(hook))]),
        mapResponseHooks: uniqueIdentity([...(route.mapResponseHooks ?? []), ...child.mapResponseHooks, ...this.mapResponseHooks.filter((hook) => !this.localMapResponseHooks.includes(hook))]),
        afterResponseHooks: uniqueIdentity([...(route.afterResponseHooks ?? []), ...child.afterResponseHooks, ...this.afterResponseHooks.filter((hook) => !this.localAfterResponseHooks.includes(hook))]),
        afterHooks: uniqueIdentity([...this.afterHooks.filter((hook) => !this.localAfterHooks.includes(hook)), ...this.scopedAfterHooks, ...route.afterHooks.filter((hook) => !childGeneratedFeatureHooks?.after.includes(hook))]),
        // Give the mounted route's own handlers first chance to recover its
        // failures; parent handlers remain the fallback for the subtree.
        errorHandlers: uniqueIdentity([...route.errorHandlers, ...child.scopedErrorHandlers, ...this.errorHandlers.filter((handler) => !this.localErrorHandlers.includes(handler)), ...this.scopedErrorHandlers]),
        routeGuards: uniqueIdentity([...(route.routeGuards ?? []).filter((guard) => !childGeneratedFeatureHooks?.guards.includes(guard)), ...this.routeGuardsFor(inheritedAuth)])
      }
      mounted.metadata = normalizeRouteMetadata(mounted)
      for (const name of Object.keys(inheritedFeatures)) {
        if (childFeatureNames.has(name) && !rebuiltFeatureNames.has(name)) continue
        this.applyRouteFeature(mounted, name, inheritedFeatures[name])
      }
      this.applyRouteAuthorization(mounted)
      this.registerRoute(mounted, true)
      mountedRoutes.push(mounted)
    }
    for (const hook of child.scopedHooks) {
      for (const route of mountedRoutes) if (!route.hooks.includes(hook)) route.hooks.push(hook)
    }
    for (const hook of child.scopedTransformHooks) {
      for (const route of mountedRoutes) if (!route.hooks.includes(hook)) route.hooks.push(hook)
    }
    for (const hook of child.globalHooks) {
      if (!this.hooks.includes(hook)) this.hooks.push(hook)
      for (const route of this.graph.routes) if (!route.hooks.includes(hook)) route.hooks.push(hook)
    }
    if (child.globalHooks.length > 0) {
      this.globalHooks.push(...child.globalHooks.filter((hook) => !this.globalHooks.includes(hook)))
    }
    for (const hook of child.globalTransformHooks) {
      if (!this.transformHooks.includes(hook)) this.transformHooks.push(hook)
      for (const route of this.graph.routes) if (!route.hooks.includes(hook)) route.hooks.push(hook)
    }
    if (child.globalTransformHooks.length > 0) {
      this.globalTransformHooks.push(...child.globalTransformHooks.filter((hook) => !this.globalTransformHooks.includes(hook)))
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
    for (const hook of child.globalAfterHooks) {
      if (!this.afterHooks.includes(hook)) this.afterHooks.push(hook)
      for (const route of this.graph.routes) if (!route.afterHooks.includes(hook)) route.afterHooks.push(hook)
    }
    for (const handler of child.globalErrorHandlers) {
      if (!this.errorHandlers.includes(handler)) this.errorHandlers.push(handler)
      for (const route of this.graph.routes) if (!route.errorHandlers.includes(handler)) route.errorHandlers.push(handler)
    }
    for (const ws of child.websocketRoutes) {
      const path = `${base}${ws.path === "/" ? "" : ws.path}`.replace(/\/\/+/g, "/") || "/"
      this.websocketRoutes.push({ path, handlers: ws.handlers })
    }
    return this
  }

  group<Prefix extends string, Child extends Nelysia<any, any, any, any>>(prefix: Prefix, callback: (app: Nelysia<Extensions, Routes, Models, MacroNames>) => Child): Nelysia<Extensions, MergeRouteMaps<Routes, PrefixRoutes<Prefix, RoutesOf<Child>>>, Models & ModelsOf<Child>, MergeMacroNames<MacroNames, MacrosOf<Child>>>
  group(prefix: string, callback: (app: Nelysia<Extensions, Routes, Models, MacroNames>) => void): this
  group<Prefix extends string, Guard extends GuardOptions<Models>, Child extends Nelysia<any, any, any, any>>(prefix: Prefix, options: Guard, callback: (app: Nelysia<Extensions, Routes, Models, MacroNames>) => Child): Nelysia<Extensions, MergeRouteMaps<Routes, PrefixRoutes<Prefix, ApplyGuard<RoutesOf<Child>, Guard, Models>>>, Models & ModelsOf<Child>, MergeMacroNames<MacroNames, MacrosOf<Child>>>
  group(prefix: string, options: GuardOptions<Models>, callback: (app: Nelysia<Extensions, Routes, Models, MacroNames>) => void): this
  group(prefix: string, optionsOrCallback: GuardOptions<Models> | ((app: Nelysia<any, any, any>) => void), maybeCallback?: (app: Nelysia<any, any, any>) => void): this {
    const child = new Nelysia({
      bodyLimit: this.bodyLimit,
      trustedProxy: this.trustedProxy,
      secureCookies: this.secureCookies,
      requestId: this.requestIdEnabled,
      telemetry: this.telemetry
    })
    this.inheritProviders(child)
    for (const [name, definition] of this.macros) child.macros.set(name, definition)
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
    const startBun = () => {
      const server = createBunServer(this, actualPort, { hostname }) as { port: number; hostname?: string }
      const resolvedHost = server.hostname ?? hostname ?? "localhost"
      const info: ServerInfo = {
        port: server.port,
        hostname: resolvedHost,
        url: `http://${resolvedHost}:${server.port}`,
        server,
        stop: () => (server as { stop?: (closeActiveConnections?: boolean) => void }).stop?.(true)
      }
      if (callback) callback(info)
      return server
    }
    if (runtime.Bun) {
      if (this.modulePromises.length === 0) return startBun()
      return attachServerControls(this.waitForModules().then(startBun))
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
            server: nodeServer,
            stop: () => new Promise<void>((resolve, reject) => nodeServer.close((error) => error ? reject(error) : resolve()))
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

  async inject<Options extends TypedInjectOptions<Routes> = TypedInjectOptions<Routes>>(options: Options = {} as Options): Promise<InjectResponse<InjectResponseBodyFor<Routes, Options>, InjectResponseStatusesFor<Routes, Options>>> {
    await this.waitForModules()
    const input = options as InjectOptions
    let url = input.url ?? input.path ?? "/"
    url = applyPathParams(url, input.params)
    if (input.query) {
      const q = new URLSearchParams(input.query).toString()
      if (q) url += (url.includes("?") ? "&" : "?") + q
    }
    const headers = input.headers instanceof Headers ? input.headers : new Headers(input.headers)
    let body = input.body
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData
    if (body !== undefined && !isFormData && typeof body !== "string" && !(body instanceof Uint8Array) && !(body instanceof ReadableStream)) {
      if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8")
    }
    const bodySize = typeof body === "string" ? new TextEncoder().encode(body).byteLength
      : body instanceof Uint8Array ? body.byteLength
        : body !== undefined && !isFormData && !(body instanceof ReadableStream) ? new TextEncoder().encode(JSON.stringify(body)).byteLength : 0
    if (bodySize > this.bodyLimit) {
      const error = new HttpError(413, "Request body is too large")
      const handled = await this.handleAdapterError(error, { method: input.method ?? "GET", url, headers, body })
      return { status: handled.status, statusCode: handled.status, headers: handled.headers, body: handled.body, async json<T = InjectResponseBodyFor<Routes, Options>>(_status?: PropertyKey): Promise<T> { return (typeof handled.body === "string" ? JSON.parse(handled.body) : handled.body) as T }, async text(): Promise<string> { return typeof handled.body === "string" ? handled.body : JSON.stringify(handled.body) } } as InjectResponse<InjectResponseBodyFor<Routes, Options>, InjectResponseStatusesFor<Routes, Options>>
    }
    const res = await this.handle({
      method: input.method ?? "GET",
      url,
      headers,
      body
    })
    return {
      status: res.status,
      statusCode: res.status,
      headers: res.headers,
      body: res.body,
      async json<T = InjectResponseBodyFor<Routes, Options>>(_status?: PropertyKey): Promise<T> {
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
    } as InjectResponse<InjectResponseBodyFor<Routes, Options>, InjectResponseStatusesFor<Routes, Options>>
  }

  /** Explicit route-map aware alias for callers that want path-specific
   * response inference at the call site. */
  async injectTyped<Options extends TypedInjectOptions<Routes>>(options: Options): Promise<InjectResponse<InjectResponseBodyFor<Routes, Options>, InjectResponseStatusesFor<Routes, Options>>> {
    return this.inject(options) as Promise<InjectResponse<InjectResponseBodyFor<Routes, Options>, InjectResponseStatusesFor<Routes, Options>>>
  }

  /** Escape hatch for tests and callers that intentionally do not use the
   * route map, while keeping `inject()` strict for typed applications. */
  async injectUntyped(options: InjectOptions = {}): Promise<InjectResponse> {
    return this.inject(options as TypedInjectOptions<Routes>) as unknown as Promise<InjectResponse>
  }

  route(method: string, path: string, handler: Handler<any>, options: RouteOptions<Models, MacroNames> = {}): this {
    const effectivePath = joinPrefix(this.prefix, path)
    const effectiveMetadata = mergeRouteMetadata(this.routeOptions, options)
    const metadata = compilePath(effectivePath)
    if (this.graph.routes.some((route) => route.method === normalizeMethod(method) && route.path === effectivePath)) {
      throw new Error(`Duplicate route: ${method.toUpperCase()} ${path}`)
    }
    const macroHooks: Hook[] = []
    const macroSchemas: Partial<Record<"bodySchema" | "paramsSchema" | "querySchema" | "headersSchema" | "responseSchema", Schema | undefined>> = {}
    for (const [name, macro] of this.macros) {
      if ((options as Record<string, unknown>)[name] !== true) continue
      if (macro.beforeHandle) macroHooks.push(macro.beforeHandle)
      if (macro.body !== undefined) macroSchemas.bodySchema = this.resolveSchema(macro.body)
      if (macro.params !== undefined) macroSchemas.paramsSchema = this.resolveSchema(macro.params)
      if (macro.query !== undefined) macroSchemas.querySchema = this.resolveSchema(macro.query)
      if (macro.headers !== undefined) macroSchemas.headersSchema = this.resolveSchema(macro.headers)
      if (macro.response !== undefined) macroSchemas.responseSchema = this.resolveSchema(macro.response)
    }
    const auth = this.normalizeAuthSetting(effectiveMetadata.auth)
    const responseMap = isResponseDefinitionMap(options.response) ? options.response : undefined
    const responseSchemas = mergeResponseDefinitions(responseMap, options.responses)
    const responseSchemaInput = responseMap === undefined ? options.response as SchemaInput | undefined : undefined
    const route: RouteRecord = {
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
      routeGuards: this.routeGuardsFor(auth),
      summary: options.summary,
      description: options.description,
      tags: options.tags,
      auth,
      role: effectiveMetadata.role ?? authDescriptorValue(auth, "role"),
      permissions: effectiveMetadata.permissions ?? authDescriptorValue(auth, "permissions"),
      features: routeFeaturesFrom(effectiveMetadata),
      bodySchema: this.resolveSchema(options.body) ?? macroSchemas.bodySchema,
      paramsSchema: this.resolveSchema(options.params) ?? macroSchemas.paramsSchema,
      querySchema: this.resolveSchema(options.query) ?? macroSchemas.querySchema,
      headersSchema: this.resolveSchema(options.headers) ?? macroSchemas.headersSchema,
      responseSchema: this.resolveSchema(responseSchemaInput) ?? macroSchemas.responseSchema,
      bodyModel: modelName(options.body),
      paramsModel: modelName(options.params),
      queryModel: modelName(options.query),
      headersModel: modelName(options.headers),
      responseModel: modelName(responseSchemaInput),
      responseSchemas: this.resolveResponseSchemas(responseSchemas),
      responseModels: modelNames(responseSchemas)
    }
    route.metadata = normalizeRouteMetadata(route)
    this.applyRouteFeatures(route)
    this.applyRouteAuthorization(route)
    this.registerRoute(route)
    return this
  }

  private registerRoute(route: RouteRecord, mounted = false): void {
    this.invalidateExecutionPlans()
    this.graph.routes.push(route)
    if (mounted) this.mountedRoutes.add(route)
    if (route.static) {
      this.staticRoutes.set(`${route.method} ${route.path}`, route)
      if (route.method === "GET") this.staticGetRoutes.set(route.path, route)
      return
    }
    const list = this.dynamicRoutes.get(route.method)
    if (list) list.push(route)
    else this.dynamicRoutes.set(route.method, [route])
  }

  private routesForScope(scope: HookScope | undefined): RouteRecord[] {
    if (scope === "local") return this.graph.routes.filter((route) => !this.mountedRoutes.has(route))
    return this.graph.routes
  }

  /**
   * Build one immutable plan per route composition. A route record is still
   * the public source of truth; the plan is deliberately kept out of it.
   */
  private executionPlan(route: RouteRecord): ExecutionPlan {
    const cached = this.executionPlanCache.get(route)
    if (cached?.version === this.executionPlanVersion) return cached.plan
    const plan = createExecutionPlan(route, {
      telemetry: this.telemetry !== undefined,
      modulesPending: this.moduleState === "pending",
      mounts: this.fetchMounts.length > 0,
      contextValues: this.contextValues.size > 0,
      contextExtensions: this.contextExtensionHooks.length > 0
    })
    this.executionPlanCache.set(route, { version: this.executionPlanVersion, plan })
    return plan
  }

  private canUseMinimalContext(route: RouteRecord): boolean {
    return this.executionPlan(route).lane === "minimal"
  }

  /**
   * Serve a minimal-context route: invoke the handler with nothing (zero-arg)
   * or a bare `{ params }` object and wrap the result exactly like the
   * generic lane does for hook-free routes (no set.status/headers to merge,
   * no schemas to validate, no hooks to run). The x-request-id response
   * contract matches createContext: echoed/generated when enabled.
   */
  private handleMinimalContext(route: RouteRecord, params: Record<string, string>, request: RequestData, method: string): ResponseData | Promise<ResponseData> {
    const handler = route.handler as (context: { params: Record<string, string> }) => unknown
    const headers = this.requestIdEnabled ? new Headers() : sharedEmptyResponseHeaders
    if (this.requestIdEnabled) {
      headers.set("x-request-id", request.requestId ?? asHeaders(request.headers).get("x-request-id") ?? `req-${method}-${request.url}`)
    }
    const finish = (result: unknown): ResponseData => {
      if (result instanceof HttpError) return this.response(errorStatusOf(result), result.body ?? { error: result.message })
      if (isResponse(result)) return result
      if (result instanceof Response) return { status: result.status, headers: mergeHeaders(headers, Object.fromEntries(result.headers.entries())), body: result.body, [responseMarker]: true as const }
      if (result instanceof ReadableStream) return { status: 200, headers, body: result, [responseMarker]: true as const }
      return { status: 200, headers, body: result, [responseMarker]: true as const }
    }
    const failed = (error: unknown): ResponseData | Promise<ResponseData> => {
      if (error instanceof HttpError) return this.response(errorStatusOf(error), error.body ?? { error: error.message })
      throw error
    }
    try {
      const invoked = handler.length === 0 ? (handler as () => unknown)() : handler({ params })
      return isThenable(invoked) ? Promise.resolve(invoked).then(finish, failed) : finish(invoked)
    } catch (error) {
      return failed(error)
    }
  }

  /**
   * Opaque handlers still receive the complete Context contract, but the
   * expensive query/store/cookie/helper values are inherited accessors and
   * only materialize when the handler reads them. Handlers that inspect own
   * keys are kept on the eager literal path by ExecutionPlan.
   */
  private createLazyFullContext(request: RequestData, params: Record<string, string>, search: string, method: string): { context: Context; responseHeaders: Headers } {
    const headers = asHeaders(request.headers)
    const requestId = this.requestIdEnabled ? request.requestId ?? headers.get("x-request-id") ?? `req-${method}-${request.url}` : ""
    const responseHeaders = new Headers()
    if (this.requestIdEnabled) responseHeaders.set("x-request-id", requestId)
    const clientIp = this.trustedProxy ? headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.remoteAddress : request.remoteAddress
    const state: LazyFullContextState = {
      search,
      headers,
      responseHeaders,
      secureCookies: this.secureCookies,
      stateValues: this.stateValues
    }
    const context = Object.create(lazyFullContextPrototype) as Context & { [lazyFullContextStateSymbol]: LazyFullContextState }
    context[lazyFullContextStateSymbol] = state
    context.request = { ...request, headers }
    context.requestId = requestId
    context.clientIp = clientIp
    context.env = request.env
    context.executionContext = request.executionContext
    context.params = params
    context.set = { status: undefined, headers: {} }
    context.body = request.body
    context.headers = headers
    context.signal = request.signal ?? defaultSignal
    return { context, responseHeaders }
  }

  private createContext(request: RequestData, params: Record<string, string>, search: string, method: string, plan?: ExecutionPlan): { context: Context; responseHeaders: Headers } {
    const headers = asHeaders(request.headers)
    const requestId = this.requestIdEnabled ? request.requestId ?? headers.get("x-request-id") ?? `req-${method}-${request.url}` : ""
    const responseHeaders = new Headers()
    if (this.requestIdEnabled) responseHeaders.set("x-request-id", requestId)
    const clientIp = this.trustedProxy ? headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.remoteAddress : request.remoteAddress
    const fullContext = plan === undefined || plan.needs.full
    const needs = (field: import("./execution.ts").ContextField): boolean => fullContext || plan?.needs.has(field) === true
    if (plan !== undefined && fullContext && !plan.needs.ownProperties && this.stateValues.size === 0 && this.decorationValues.size === 0) {
      return this.createLazyFullContext(request, params, search, method)
    }
    const context: Context = {
      request: { ...request, headers },
      requestId,
      clientIp,
      env: request.env,
      executionContext: request.executionContext,
      params,
      query: needs("query") ? createParsedQuery(search) : undefined as unknown as ParsedQuery,
      set: { status: undefined, headers: {} },
      store: needs("store") ? Object.fromEntries(this.stateValues) : undefined as unknown as Record<string, unknown>,
      body: request.body,
      headers,
      signal: request.signal ?? defaultSignal,
      cookies: needs("cookies") ? lazyCookies(headers) : undefined as unknown as Record<string, string>,
      setCookie: undefined as unknown as Context["setCookie"],
      deleteCookie: undefined as unknown as Context["deleteCookie"],
      response: undefined as unknown as Context["response"],
      html: undefined as unknown as Context["html"],
      text: undefined as unknown as Context["text"],
      json: undefined as unknown as Context["json"],
      redirect: undefined as unknown as Context["redirect"],
      header: undefined as unknown as Context["header"]
    }
    const secureCookies = this.secureCookies
    if (needs("setCookie")) context.setCookie = (name, value, options) => responseHeaders.append("set-cookie", serializeCookie(name, value, secureCookies ? { ...options, secure: options?.secure ?? true } : options))
    if (needs("deleteCookie")) context.deleteCookie = (name, options) => responseHeaders.append("set-cookie", serializeCookie(name, "", { ...options, maxAge: 0, path: options?.path ?? "/" }))
    if (needs("response")) context.response = ((bodyOrStatus: unknown, optionsOrBody?: unknown, extraHeaders?: Record<string, string>) => createContextResponse(responseHeaders, bodyOrStatus, optionsOrBody, extraHeaders)) as Context["response"]
    if (needs("html")) context.html = (body, status = 200) => ({ status, body, headers: mergeHeaders(responseHeaders, { "content-type": "text/html; charset=utf-8" }), [responseMarker]: true })
    if (needs("text")) context.text = (body, status = 200) => ({ status, body, headers: mergeHeaders(responseHeaders, { "content-type": "text/plain; charset=utf-8" }), [responseMarker]: true })
    if (needs("json")) context.json = (body, statusOrOptions = 200) => {
      const options = typeof statusOrOptions === "number" ? { status: statusOrOptions } : statusOrOptions
      return { status: options.status ?? 200, body, headers: mergeHeaders(responseHeaders, mergeHeaders(new Headers({ "content-type": "application/json; charset=utf-8" }), options.headers)), [responseMarker]: true }
    }
    if (needs("redirect")) context.redirect = (url, status = 302) => ({ status, body: undefined, headers: mergeHeaders(responseHeaders, { location: url }), [responseMarker]: true })
    if (needs("header")) context.header = (name, value) => {
      context.set.headers[name.toLowerCase()] = value
      return context
    }
    if (fullContext) {
      for (const [name, value] of this.stateValues) (context as unknown as Record<string, unknown>)[name] = value
      for (const [name, value] of this.decorationValues) {
        const resolve = () => typeof value === "function" ? (value as (context: Context) => unknown)(context) : value
        if (this.lazyDecorations.has(name)) {
          let initialized = false
          let resolved: unknown
          Object.defineProperty(context, name, {
            configurable: true,
            enumerable: !this.nonEnumerableDecorations.has(name),
            get() {
              if (!initialized) {
                resolved = resolve()
                initialized = true
              }
              return resolved
            }
          })
        } else {
          Object.defineProperty(context, name, {
            configurable: true,
            enumerable: !this.nonEnumerableDecorations.has(name),
            value: resolve(),
            writable: true
          })
        }
      }
    }
    return { context, responseHeaders }
  }

  private addContextExtension(extension: ContextExtension): void {
    this.invalidateExecutionPlans()
    const apply = async (context: Context) => {
      const values = await extension(context)
      if (values) Object.assign(context, values)
    }
    this.contextExtensionHooks.push(apply)
    for (const route of this.graph.routes) route.hooks.splice(this.contextExtensionHooks.length - 1, 0, apply)
  }

  private describeModule(seen: Set<Nelysia<any, any, any>>, parent?: string): ModuleGraphNode {
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
    if (this.moduleCompletion !== undefined) return this.moduleCompletion
    const completion = (async () => {
    let completed = 0
    while (completed < this.modulePromises.length) {
      const pending = this.modulePromises.slice(completed)
      await Promise.all(pending)
      completed += pending.length
    }
    })()
    this.moduleCompletion = completion
    return completion
  }

  /**
   * Adapter preflight: match the route and run request hooks/guards before an
   * adapter consumes a request body. The returned context is reused by
   * handle(), which preserves auth data set by a guard.
   */
  preflight(request: RequestData): Promise<import("./types.ts").RequestPreflight> {
    return Promise.resolve(this.runPreflight(request))
  }

  private runPreflight(request: RequestData): import("./types.ts").RequestPreflight | Promise<import("./types.ts").RequestPreflight> {
    if (this.moduleState === "pending") return this.waitForModules().then(() => this.preflightReference(request))
    return this.preflightReference(request)
  }

  private async preflightReference(request: RequestData): Promise<import("./types.ts").RequestPreflight> {
    if (this.modulePromises.length > 0) await this.waitForModules()
    const { pathname, search } = splitUrl(request.url)
    const method = fastNormalizeMethod(request.method)
    if (method === undefined) return { kind: "response", response: this.response(400, { error: "Unsupported HTTP method" }) }
    const mounted = this.fetchMounts.find((entry) => matchesMount(entry.prefix, pathname))
    if (mounted !== undefined) {
      const target = request.rawRequest ?? new Request(toAbsoluteUrl(request.url), {
        method: request.method,
        headers: request.headers,
        body: request.body === undefined || request.body instanceof ReadableStream || request.body instanceof Uint8Array || typeof request.body === "string"
          ? request.body as BodyInit | null | undefined
          : JSON.stringify(request.body)
      })
      const mountedResponse = await mounted.handler(target)
      return { kind: "response", response: { status: mountedResponse.status, headers: new Headers(mountedResponse.headers), body: mountedResponse, [responseMarker]: true } }
    }
    const lookupMethod = method === "HEAD" ? "GET" : method
    const normalized = normalizePathname(pathname)
    const direct = this.staticRoutes.get(`${lookupMethod} ${normalized}`)
    const match = direct === undefined ? lookupDynamicPath(this.dynamicRoutes.get(lookupMethod) ?? EMPTY_ROUTES, normalized) : undefined
    const route = direct ?? match?.route
    if (route === undefined) {
      return { kind: "response", response: await this.handle({ ...request, body: undefined, preflight: undefined }) }
    }
    const params = match?.params ?? {}
    const plan = this.executionPlan(route)
    const { context, responseHeaders } = this.createContext(request, params, search, method, plan.lane === "specialized" ? plan : undefined)
    assignContextRoute(context, route)
    try {
      for (const hook of route.requestHooks ?? []) {
        const result = await hook(request)
        if (isResponse(result)) return { kind: "response", response: result }
        if (result instanceof Response) return { kind: "response", response: responseFromNative(result, context.set, responseHeaders) }
      }
      for (const guard of route.routeGuards ?? []) {
        const result = await guard(context)
        if (isResponse(result)) return { kind: "response", response: result }
        if (result instanceof Response) return { kind: "response", response: responseFromNative(result, context.set, responseHeaders) }
      }
      return { kind: "route", route, params, context, responseHeaders, method, pathname: normalized, search, url: request.url }
    } catch (error) {
      return { kind: "response", response: await this.handleAdapterError(error, { ...request, preflight: undefined }) }
    }
  }

  private dependsOn(target: Nelysia<any, any, any>, seen = new Set<Nelysia<any, any, any>>()): boolean {
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

  private applyGuard(child: Nelysia<any, any, any>, options: GuardOptions<any>): void {
    for (const route of child.graph.routes) {
      if (options.body !== undefined && route.bodySchema === undefined) route.bodySchema = child.resolveSchema(options.body)
      if (options.params !== undefined && route.paramsSchema === undefined) route.paramsSchema = child.resolveSchema(options.params)
      if (options.query !== undefined && route.querySchema === undefined) route.querySchema = child.resolveSchema(options.query)
      if (options.headers !== undefined && route.headersSchema === undefined) route.headersSchema = child.resolveSchema(options.headers)
      if (options.response !== undefined && route.responseSchema === undefined && !isResponseDefinitionMap(options.response)) route.responseSchema = child.resolveSchema(options.response)
      if (route.responseSchemas === undefined) {
        const responseMap = mergeResponseDefinitions(isResponseDefinitionMap(options.response) ? options.response : undefined, options.responses)
        if (responseMap !== undefined) {
          route.responseSchemas = child.resolveResponseSchemas(responseMap)
          route.responseModels = modelNames(responseMap)
        }
      }
      const inheritedMetadata = mergeRouteMetadata(child.routeOptions, options)
      if (route.auth === undefined && inheritedMetadata.auth !== undefined) {
        route.auth = child.normalizeAuthSetting(inheritedMetadata.auth)
        route.routeGuards = uniqueIdentity([...(route.routeGuards ?? []), ...child.routeGuardsFor(route.auth)])
      }
      if (route.role === undefined) route.role = inheritedMetadata.role ?? authDescriptorValue(route.auth, "role")
      if (route.permissions === undefined) route.permissions = inheritedMetadata.permissions ?? authDescriptorValue(route.auth, "permissions")
      const features = route.features ?? (route.features = {})
      for (const [name, value] of Object.entries(routeFeaturesFrom(inheritedMetadata))) {
        if (!(name in features)) features[name] = value
        else if (features[name] !== false && value !== undefined) features[name] = mergeFeatureValue(value, features[name])
      }
      route.metadata = normalizeRouteMetadata(route)
      child.applyRouteFeatures(route)
      child.applyRouteAuthorization(route)
      if (options.beforeHandle !== undefined) route.hooks.push(options.beforeHandle)
    }
  }

  handle(request: RequestData): Promise<ResponseData> {
    return Promise.resolve().then(() => this.runHandle(request))
  }

  private runNativeHandle(request: NativeRequestInput | Request, nativeRequestId?: string): Response | Promise<Response> | undefined {
    if (this.moduleState !== "loaded") return undefined
    const method = fastNormalizeMethod(request.method)
    const data = request as NativeRequestInput
    const requestId = "requestId" in request ? data.requestId : nativeRequestId
    // The native boundary is only allowed to elide preflight for bodyless
    // requests. POST/PUT/etc. still need adapter body parsing and must use the
    // reference preflight contract.
    if (method === undefined || (method !== "GET" && method !== "HEAD") || this.fetchMounts.length > 0 || ("preflight" in request && data.preflight !== undefined)) return undefined
    const runtimeRequest = request instanceof Request ? undefined : data
    const lookupMethod = method === "HEAD" ? "GET" : method
    const url = request.url
    const fastPath = lookupMethod === "GET" ? normalizePathname(fastPathname(url)) : undefined
    if (lookupMethod === "GET") {
      const direct = this.staticGetRoutes.get(fastPath!)
      if (direct !== undefined) return this.runNativeMatch(request, runtimeRequest, direct, {}, method, fastPath ?? direct.path, url, requestId)
    }
    const dynamicRoutes = this.dynamicRoutes.get(lookupMethod) ?? EMPTY_ROUTES
    if (dynamicRoutes.length === 1) {
      const route = dynamicRoutes[0]!
      const params = fastPath === undefined ? matchSingleDynamicUrl(route, url) : matchSingleDynamicPath(route, fastPath)
      if (params !== undefined) return this.runNativeMatch(request, runtimeRequest, route, params, method, fastPath ?? route.path, url, requestId)
    }
    const match = lookupDynamicUrl(dynamicRoutes, url)
    return match === undefined ? undefined : this.runNativeMatch(request, runtimeRequest, match.route, match.params, method, fastPath ?? match.route.path, url, requestId)
  }

  private runNativeMatch(
    nativeRequest: NativeRequestInput | Request,
    runtimeRequest: RequestData | undefined,
    route: RouteRecord,
    params: Record<string, string>,
    method: string,
    pathname: string,
    url: string,
    requestId?: string
  ): Response | Promise<Response> | undefined {
    const plan = this.executionPlan(route)
    if (plan.pipelineSafe && plan.contextFreePipeline) {
      return this.handleContextFreeNative(nativeRequest, params, method, plan, requestId)
    }
    const request = runtimeRequest ?? {
      method: nativeRequest.method,
      url,
      requestId,
      headers: nativeRequest.headers,
      rawRequest: nativeRequest instanceof Request ? nativeRequest : undefined
    }
    const queryIndex = url.indexOf("?")
    return this.runNativePrepared({
      request,
      route,
      params,
      method,
      pathname,
      search: queryIndex === -1 ? "" : url.slice(queryIndex + 1),
      plan
    }, requestId)
  }

  private runNativePrepared(prepared: PreparedRequest, requestId?: string): Response | Promise<Response> | undefined {
    // A pipeline-safe route has no observable request/body/guard stage that
    // requires preflight. Run the same internal executor used by Fetch, then
    // normalize at the adapter boundary. This also covers opaque handlers:
    // they still receive the full context, but do not pay for a second route
    // match and an async preflight/handle pair.
    if (!prepared.plan.pipelineSafe) return undefined
    if (prepared.plan.contextFreePipeline) return this.handleContextFreeNative(prepared.request, prepared.params, prepared.method, prepared.plan, requestId)
    if (prepared.plan.allSynchronous && prepared.plan.mapResponseHooks.length === 0
      && prepared.plan.afterHooks.length === 0 && prepared.plan.afterResponseHooks.length === 0 && prepared.plan.errorHandlers.length === 0) {
      return this.handleSpecializedNativeSynchronous(prepared)
    }
    return this.toNativeResponse(this.runPrepared(prepared.request, prepared))
  }

  private toNativeResponse(result: ResponseData | Promise<ResponseData>): Response | Promise<Response> {
    if (isThenable(result)) return Promise.resolve(result).then((response) => this.nativeResponseData(response))
    return this.nativeResponseData(result)
  }

  private handleContextFreeNative(request: Pick<RequestData, "method" | "url" | "headers">, params: Record<string, string>, method: string, plan: ExecutionPlan, requestId?: string): Response | Promise<Response> {
    const headers = this.requestIdEnabled ? new Headers() : sharedEmptyResponseHeaders
    if (this.requestIdEnabled) headers.set("x-request-id", requestId ?? asHeaders(request.headers).get("x-request-id") ?? `req-${method}-${request.url}`)
    const handlerContext = plan.needs.has("params") ? { params } : undefined
    return this.runContextFreeNative(plan, headers, handlerContext)
  }

  private runContextFreeNative(
    plan: ExecutionPlan,
    headers: Headers,
    handlerContext: { params: Record<string, string> } | undefined,
    hookIndex = 0
  ): Response | Promise<Response> {
    try {
      if (plan.nativeHooks.length > 0) {
        for (let cursor = hookIndex; cursor < plan.nativeHooks.length; cursor++) {
          const value = (plan.nativeHooks[cursor] as unknown as () => unknown)()
          if (isThenable(value)) return Promise.resolve(value).then((resolved) => {
            if (isResponse(resolved) || resolved instanceof Response) return this.finishContextFreeNative(resolved, headers)
            return this.runContextFreeNative(plan, headers, handlerContext, cursor + 1)
          }, (error) => this.finishContextFreeNativeError(error, headers))
          if (isResponse(value) || value instanceof Response) return this.finishContextFreeNative(value, headers)
        }
      }
      const result = handlerContext === undefined
        ? (plan.handler as unknown as () => unknown)()
        : (plan.handler as unknown as (context: { params: Record<string, string> }) => unknown)(handlerContext)
      return isThenable(result)
        ? Promise.resolve(result).then((value) => this.finishContextFreeNative(value, headers), (error) => this.finishContextFreeNativeError(error, headers))
        : this.finishContextFreeNative(result, headers)
    } catch (error) {
      if (error instanceof HttpError) return this.finishContextFreeNative(error, headers)
      throw error
    }
  }

  private finishContextFreeNative(value: unknown, headers: Headers): Response {
    if (value instanceof HttpError) return this.nativeBodyResponse(errorStatusOf(value), value.body ?? { error: value.message }, headers)
    if (isResponse(value)) return this.nativeResponseData(value)
    if (value instanceof Response) {
      if (headers === sharedEmptyResponseHeaders) return value
      return new Response(value.body, { status: value.status, headers: mergeHeaders(headers, Object.fromEntries(value.headers.entries())) })
    }
    if (value instanceof ReadableStream) return new Response(value, { status: 200, headers })
    return this.nativeBodyResponse(200, value, headers)
  }

  private nativeResponseData(result: ResponseData): Response {
    if (result.body instanceof Response) {
      const headers = mergeHeaders(result.headers, Object.fromEntries(result.body.headers.entries()))
      return new Response(result.body.body, { status: result.status, headers })
    }
    if (result.body instanceof ReadableStream) return new Response(result.body, { status: result.status, headers: result.headers })
    return this.nativeBodyResponse(result.status, result.body, result.headers)
  }

  private nativeBodyResponse(status: number, body: unknown, headers: Headers): Response {
    if (body instanceof ReadableStream) return new Response(body, { status, headers })
    if (body instanceof Response) return new Response(body.body, { status, headers: mergeHeaders(headers, Object.fromEntries(body.headers.entries())) })
    if (body === undefined || body === null) return new Response(null, { status, headers })
    if (typeof body === "string" || body instanceof Uint8Array) return new Response(body as BodyInit, { status, headers })
    if (headers === sharedEmptyResponseHeaders) return new Response(JSON.stringify(body), { status, headers: sharedNativeJsonHeaders })
    if (!headers.has("content-type")) headers.set("content-type", "application/json; charset=utf-8")
    return new Response(JSON.stringify(body), { status, headers })
  }

  private runHandle(request: RequestData): ResponseData | Promise<ResponseData> {
    if (this.moduleState === "pending") return this.waitForModules().then(() => this.runHandle(request))
    const prepared = this.prepareRuntimeRequest(request)
    if (prepared === undefined) return this.handleReference(request)
    return this.runPrepared(request, prepared)
  }

  private runPrepared(request: RequestData, prepared: PreparedRequest): ResponseData | Promise<ResponseData> {
    if (prepared.plan.lane === "minimal") return this.handleMinimalContext(prepared.route, prepared.params, request, prepared.method)
    if (prepared.plan.contextFreePipeline) return this.handleContextFreePipeline(prepared)
    if (prepared.plan.pipelineSafe) return this.handleSpecialized(prepared)
    return this.handleReference(request, prepared)
  }

  private handleContextFreePipeline(prepared: PreparedRequest): ResponseData | Promise<ResponseData> {
    const headers = this.requestIdEnabled ? new Headers() : sharedEmptyResponseHeaders
    if (this.requestIdEnabled) headers.set("x-request-id", prepared.request.requestId ?? asHeaders(prepared.request.headers).get("x-request-id") ?? `req-${prepared.method}-${prepared.request.url}`)
    const handlerContext = prepared.plan.needs.has("params") ? { params: prepared.params } : undefined
    if (prepared.plan.allSynchronous) return this.runContextFreeSynchronous(prepared, headers, handlerContext)
    return this.runContextFreeWithClosures(prepared, headers, handlerContext)
  }

  private runContextFreeSynchronous(
    prepared: PreparedRequest,
    headers: Headers,
    handlerContext: { params: Record<string, string> } | undefined,
    hookIndex = 0
  ): ResponseData | Promise<ResponseData> {
    try {
      for (let cursor = hookIndex; cursor < prepared.plan.hooks.length; cursor++) {
        const value = (prepared.plan.hooks[cursor] as unknown as () => unknown)()
        if (isThenable(value)) return Promise.resolve(value).then((resolved) => {
          if (isResponse(resolved) || resolved instanceof Response) return this.finishContextFree(resolved, headers)
          return this.runContextFreeSynchronous(prepared, headers, handlerContext, cursor + 1)
        }, (error) => this.finishContextFreeError(error))
        if (isResponse(value) || value instanceof Response) return this.finishContextFree(value, headers)
      }
      const result = handlerContext === undefined
        ? (prepared.plan.handler as unknown as () => unknown)()
        : (prepared.plan.handler as unknown as (context: { params: Record<string, string> }) => unknown)(handlerContext)
      return isThenable(result)
        ? Promise.resolve(result).then((value) => this.finishContextFree(value, headers), (error) => this.finishContextFreeError(error))
        : this.finishContextFree(result, headers)
    } catch (error) {
      if (error instanceof HttpError) return this.response(errorStatusOf(error), error.body ?? { error: error.message })
      throw error
    }
  }

  private runContextFreeWithClosures(prepared: PreparedRequest, headers: Headers, handlerContext: { params: Record<string, string> } | undefined): ResponseData | Promise<ResponseData> {
    const finish = (value: unknown): ResponseData => this.finishContextFree(value, headers)
    const invoke = (index: number): ResponseData | Promise<ResponseData> => {
      for (let cursor = index; cursor < prepared.plan.hooks.length; cursor++) {
        const value = (prepared.plan.hooks[cursor] as unknown as () => unknown)()
        if (isThenable(value)) return Promise.resolve(value).then((resolved) => {
          if (isResponse(resolved) || resolved instanceof Response) return finish(resolved)
          return invoke(cursor + 1)
        }, (error) => this.finishContextFreeError(error))
        if (isResponse(value) || value instanceof Response) return finish(value)
      }
      const result = handlerContext === undefined
        ? (prepared.plan.handler as unknown as () => unknown)()
        : (prepared.plan.handler as unknown as (context: { params: Record<string, string> }) => unknown)(handlerContext)
      return isThenable(result)
        ? Promise.resolve(result).then(finish, (error) => this.finishContextFreeError(error))
        : finish(result)
    }
    try { return invoke(0) } catch (error) {
      if (error instanceof HttpError) return this.response(errorStatusOf(error), error.body ?? { error: error.message })
      throw error
    }
  }

  private finishContextFree(value: unknown, headers: Headers): ResponseData {
    if (value instanceof HttpError) return this.response(errorStatusOf(value), value.body ?? { error: value.message })
    if (isResponse(value)) return value
    if (value instanceof Response) return { status: value.status, headers: mergeHeaders(headers, Object.fromEntries(value.headers.entries())), body: value.body, [responseMarker]: true as const }
    if (value instanceof ReadableStream) return { status: 200, headers, body: value, [responseMarker]: true as const }
    return { status: 200, headers, body: value, [responseMarker]: true as const }
  }

  private finishContextFreeError(error: unknown): ResponseData {
    if (error instanceof HttpError) return this.response(errorStatusOf(error), error.body ?? { error: error.message })
    throw error
  }

  private finishContextFreeNativeError(error: unknown, headers: Headers): Response {
    if (error instanceof HttpError) return this.nativeBodyResponse(errorStatusOf(error), error.body ?? { error: error.message }, headers)
    throw error
  }

  private prepareRuntimeRequest(request: RequestData): PreparedRequest | undefined {
    if (request.preflight?.kind === "response") return undefined
    const method = fastNormalizeMethod(request.method)
    if (method === undefined || this.fetchMounts.length > 0) return undefined
    const preflight = request.preflight?.kind === "route" ? request.preflight : undefined
    // The common context-free dynamic route can match directly against the
    // original absolute URL. This mirrors the compiler's prefix matcher and
    // avoids allocating pathname/search/segment strings before the plan is
    // known to need neither value.
    if (preflight === undefined) {
      const lookupMethod = method === "HEAD" ? "GET" : method
      const fastPath = normalizePathname(fastPathname(request.url))
      const fastDirect = lookupMethod === "GET" ? this.staticGetRoutes.get(fastPath) : undefined
      if (fastDirect !== undefined) {
        const fastPlan = this.executionPlan(fastDirect)
        if (fastPlan.lane !== "generic" && fastPlan.contextFreePipeline) {
          return { request, route: fastDirect, params: {}, method, pathname: fastDirect.path, search: "", plan: fastPlan }
        }
        const queryIndex = request.url.indexOf("?")
        return {
          request,
          route: fastDirect,
          params: {},
          method,
          pathname: fastPath,
          search: queryIndex === -1 ? "" : request.url.slice(queryIndex + 1),
          plan: fastPlan
        }
      }
      const fastMatch = lookupDynamicUrl(this.dynamicRoutes.get(lookupMethod) ?? EMPTY_ROUTES, request.url)
      if (fastMatch !== undefined) {
        const fastPlan = this.executionPlan(fastMatch.route)
        if (fastPlan.lane !== "generic" && fastPlan.contextFreePipeline) {
          return { request, route: fastMatch.route, params: fastMatch.params, method, pathname: fastMatch.route.path, search: "", plan: fastPlan }
        }
        const queryIndex = request.url.indexOf("?")
        return {
          request,
          route: fastMatch.route,
          params: fastMatch.params,
          method,
          pathname: fastPath,
          search: queryIndex === -1 ? "" : request.url.slice(queryIndex + 1),
          plan: fastPlan
        }
      }
    }
    const split = splitUrl(request.url)
    const requestPathname = normalizePathname(split.pathname)
    const requestSearch = split.search
    let pathname: string
    let search: string
    let route: RouteRecord | undefined
    let params: Record<string, string>
    let reusablePreflight: typeof preflight
    if (preflight !== undefined && preflight.method === method && preflight.pathname === requestPathname && preflight.search === requestSearch) {
      pathname = preflight.pathname
      search = preflight.search
      route = preflight.route
      params = preflight.params
      reusablePreflight = preflight
    } else {
      pathname = requestPathname
      search = requestSearch
      const lookupMethod = method === "HEAD" ? "GET" : method
      const direct = this.staticRoutes.get(`${lookupMethod} ${pathname}`)
      const match = direct === undefined ? lookupDynamicPath(this.dynamicRoutes.get(lookupMethod) ?? EMPTY_ROUTES, pathname) : undefined
      route = direct ?? match?.route
      params = match?.params ?? {}
    }
    if (route === undefined) return undefined
    const plan = this.executionPlan(route)
    return { request, route, params, method, pathname, search, plan, preflight: reusablePreflight }
  }

  private handleSpecialized(prepared: PreparedRequest): ResponseData | Promise<ResponseData> {
    const { request, route, params, method, search, plan, preflight } = prepared
    const built = preflight === undefined ? this.createContext(request, params, search, method, plan) : { context: preflight.context, responseHeaders: preflight.responseHeaders }
    const { context, responseHeaders } = built
    if (preflight !== undefined) {
      context.body = request.body
      Object.assign(context.request, request, { headers: asHeaders(request.headers), body: request.body })
    }
    assignContextRoute(context, route)
    if (plan.allSynchronous && plan.mapResponseHooks.length === 0
      && plan.afterHooks.length === 0 && plan.afterResponseHooks.length === 0 && plan.errorHandlers.length === 0) {
      return this.handleSpecializedSynchronous(prepared, context, responseHeaders)
    }
    const respondHook = (value: unknown): ResponseData | undefined => {
      if (isResponse(value)) return value
      if (value instanceof Response) return responseFromNative(value, context.set)
      return undefined
    }
    const normalize = (value: unknown): ResponseData => {
      if (value instanceof HttpError) throw value
      const hasSetHeaders = Object.keys(context.set.headers).length > 0
      const effectiveHeaders = hasSetHeaders ? mergeHeaders(responseHeaders, context.set.headers) : responseHeaders
      if (isResponse(value)) {
        if (context.set.status !== undefined && value.status === 200) return { ...value, status: context.set.status, headers: mergeHeaders(value.headers, context.set.headers) }
        return hasSetHeaders ? { ...value, headers: mergeHeaders(value.headers, context.set.headers) } : value
      }
      if (value instanceof Response) return { status: context.set.status ?? value.status, headers: mergeHeaders(effectiveHeaders, Object.fromEntries(value.headers.entries())), body: value.body, [responseMarker]: true as const }
      return { status: context.set.status ?? 200, body: value, headers: effectiveHeaders, [responseMarker]: true as const }
    }
    const finishAfter = (response: ResponseData): ResponseData | Promise<ResponseData> => {
      for (const hook of plan.afterResponseHooks) {
        const result = hook(context, response)
        if (isThenable(result)) return Promise.resolve(result).then(() => finishAfter(response))
      }
      return response
    }
    const finishMap = (response: ResponseData, index = 0): ResponseData | Promise<ResponseData> => {
      for (let cursor = index; cursor < plan.mapResponseHooks.length; cursor++) {
        const mapped = plan.mapResponseHooks[cursor]!(context, response)
        if (isThenable(mapped)) return Promise.resolve(mapped).then((value) => {
          if (isResponse(value)) response = value
          else if (value !== undefined) response.body = value
          return finishMap(response, cursor + 1)
        })
        if (isResponse(mapped)) response = mapped
        else if (mapped !== undefined) response.body = mapped
      }
      return runAfterHooks(response)
    }
    const runAfterHooks = (response: ResponseData, index = 0): ResponseData | Promise<ResponseData> => {
      for (let cursor = index; cursor < plan.afterHooks.length; cursor++) {
        const result = plan.afterHooks[cursor]!(context, response)
        if (isThenable(result)) return Promise.resolve(result).then(() => runAfterHooks(response, cursor + 1))
      }
      return finishAfter(response)
    }
    const runHandler = (): ResponseData | Promise<ResponseData> => {
      const value = context.executionControl === undefined ? plan.handler(context) : context.executionControl.invoke(() => plan.handler(context))
      if (isThenable(value)) return Promise.resolve(value).then((result) => {
        const response = normalize(result)
        return finishMap(response)
      })
      const response = normalize(value)
      return finishMap(response)
    }
    const runHooks = (index = 0): ResponseData | Promise<ResponseData> => {
      for (let cursor = index; cursor < plan.hooks.length; cursor++) {
        const value = plan.hooks[cursor]!(context)
        const early = respondHook(value)
        if (isThenable(value)) return Promise.resolve(value).then((result) => {
          const response = respondHook(result)
          if (response !== undefined) return response
          return runHooks(cursor + 1)
        })
        if (early !== undefined) return early
      }
      return runHandler()
    }
    const runErrorHandler = (error: unknown, index = 0): ResponseData | Promise<ResponseData> => {
      context.set.status = errorStatusOf(error)
      for (let cursor = index; cursor < plan.errorHandlers.length; cursor++) {
        let result: unknown
        try { result = plan.errorHandlers[cursor]!(error, context) } catch { continue }
        if (isThenable(result)) return Promise.resolve(result).then((value) => {
          if (isResponse(value)) return value
          if (value instanceof Response) return responseFromNative(value, context.set, responseHeaders)
          if (value !== undefined) return { status: context.set.status ?? errorStatusOf(error), body: value, headers: mergeHeaders(responseHeaders, context.set.headers), [responseMarker]: true as const }
          return runErrorHandler(error, cursor + 1)
        }, () => runErrorHandler(error, cursor + 1))
        if (isResponse(result)) return result
        if (result instanceof Response) return responseFromNative(result, context.set, responseHeaders)
        if (result !== undefined) return { status: context.set.status ?? errorStatusOf(error), body: result, headers: mergeHeaders(responseHeaders, context.set.headers), [responseMarker]: true as const }
      }
      if (error instanceof HttpError) return this.response(errorStatusOf(error), error.body ?? { error: error.message })
      throw error
    }
    try {
      const result = runHooks()
      if (isThenable(result)) return Promise.resolve(result).catch((error) => runErrorHandler(error)).finally(() => context.executionControl?.cleanup())
      context.executionControl?.cleanup()
      return result
    } catch (error) {
      try {
        const result = runErrorHandler(error)
        if (isThenable(result)) return Promise.resolve(result).finally(() => context.executionControl?.cleanup())
        context.executionControl?.cleanup()
        return result
      } catch (nextError) {
        context.executionControl?.cleanup()
        throw nextError
      }
    }
  }

  /**
   * Small synchronous generic lane for opaque handlers with no lifecycle
   * stages left to run. The handler still receives the full context, but the
   * common path avoids allocating the closure graph used by the reference
   * async-compatible runner. Thenables are checked at the invocation boundary
   * so a sync-classified handler that returns a Promise keeps its semantics.
   */
  private handleSpecializedSynchronous(prepared: PreparedRequest, context: Context, responseHeaders: Headers): ResponseData | Promise<ResponseData> {
    const runHandler = (): ResponseData | Promise<ResponseData> => {
      const result = context.executionControl === undefined
        ? prepared.plan.handler(context)
        : context.executionControl.invoke(() => prepared.plan.handler(context))
      if (isThenable(result)) {
        return Promise.resolve(result).then(
          (value) => this.finishSpecializedSynchronous(value, context, responseHeaders),
          (error) => this.finishSpecializedSynchronousError(error)
        )
      }
      return this.finishSpecializedSynchronous(result, context, responseHeaders)
    }
    const runHooks = (start = 0): ResponseData | Promise<ResponseData> => {
      for (let cursor = start; cursor < prepared.plan.hooks.length; cursor++) {
        const hook = prepared.plan.hooks[cursor]!
        const value = context.executionControl === undefined
          ? hook(context)
          : context.executionControl.invoke(() => hook(context))
        if (isThenable(value)) return Promise.resolve(value).then((resolved) => {
          if (isResponse(resolved)) return resolved
          if (resolved instanceof Response) return responseFromNative(resolved, context.set, responseHeaders)
          return runHooks(cursor + 1)
        }, (error) => this.finishSpecializedSynchronousError(error))
        if (isResponse(value)) return value
        if (value instanceof Response) return responseFromNative(value, context.set, responseHeaders)
      }
      return runHandler()
    }
    try {
      const result = runHooks()
      if (isThenable(result)) return Promise.resolve(result).finally(() => context.executionControl?.cleanup())
      context.executionControl?.cleanup()
      return result
    } catch (error) {
      context.executionControl?.cleanup()
      return this.finishSpecializedSynchronousError(error)
    }
  }

  private finishSpecializedSynchronous(value: unknown, context: Context, responseHeaders: Headers): ResponseData {
    if (value instanceof HttpError) return this.response(errorStatusOf(value), value.body ?? { error: value.message })
    const hasSetHeaders = Object.keys(context.set.headers).length > 0
    const effectiveHeaders = hasSetHeaders ? mergeHeaders(responseHeaders, context.set.headers) : responseHeaders
    if (isResponse(value)) {
      if (context.set.status !== undefined && value.status === 200) return { ...value, status: context.set.status, headers: mergeHeaders(value.headers, context.set.headers) }
      return hasSetHeaders ? { ...value, headers: mergeHeaders(value.headers, context.set.headers) } : value
    }
    if (value instanceof Response) return { status: context.set.status ?? value.status, headers: mergeHeaders(effectiveHeaders, Object.fromEntries(value.headers.entries())), body: value.body, [responseMarker]: true as const }
    return { status: context.set.status ?? 200, body: value, headers: effectiveHeaders, [responseMarker]: true as const }
  }

  private finishSpecializedSynchronousError(error: unknown): ResponseData {
    if (error instanceof HttpError) return this.response(errorStatusOf(error), error.body ?? { error: error.message })
    throw error
  }

  private handleSpecializedNativeSynchronous(prepared: PreparedRequest): Response | Promise<Response> {
    const { request, route, params, method, search, plan, preflight } = prepared
    const built = preflight === undefined ? this.createContext(request, params, search, method, plan) : { context: preflight.context, responseHeaders: preflight.responseHeaders }
    const { context, responseHeaders } = built
    if (preflight !== undefined) {
      context.body = request.body
      Object.assign(context.request, request, { headers: asHeaders(request.headers), body: request.body })
    }
    assignContextRoute(context, route)
    const runHandler = (): Response | Promise<Response> => {
      const result = context.executionControl === undefined
        ? plan.handler(context)
        : context.executionControl.invoke(() => plan.handler(context))
      if (isThenable(result)) {
        return Promise.resolve(result).then(
          (value) => this.finishSpecializedNativeSynchronous(value, context, responseHeaders),
          (error) => this.finishSpecializedNativeSynchronousError(error)
        )
      }
      return this.finishSpecializedNativeSynchronous(result, context, responseHeaders)
    }
    const runHooks = (start = 0): Response | Promise<Response> => {
      for (let cursor = start; cursor < plan.hooks.length; cursor++) {
        const hook = plan.hooks[cursor]!
        const value = context.executionControl === undefined
          ? hook(context)
          : context.executionControl.invoke(() => hook(context))
        if (isThenable(value)) return Promise.resolve(value).then((resolved) => {
          if (isResponse(resolved) || resolved instanceof Response) return this.finishSpecializedNativeSynchronous(resolved, context, responseHeaders)
          return runHooks(cursor + 1)
        }, (error) => this.finishSpecializedNativeSynchronousError(error))
        if (isResponse(value) || value instanceof Response) return this.finishSpecializedNativeSynchronous(value, context, responseHeaders)
      }
      return runHandler()
    }
    try {
      const result = runHooks()
      if (isThenable(result)) return Promise.resolve(result).finally(() => context.executionControl?.cleanup())
      context.executionControl?.cleanup()
      return result
    } catch (error) {
      context.executionControl?.cleanup()
      return this.finishSpecializedNativeSynchronousError(error)
    }
  }

  private finishSpecializedNativeSynchronous(value: unknown, context: Context, responseHeaders: Headers): Response {
    if (value instanceof HttpError) return this.nativeBodyResponse(errorStatusOf(value), value.body ?? { error: value.message }, sharedEmptyResponseHeaders)
    const hasSetHeaders = Object.keys(context.set.headers).length > 0
    const effectiveHeaders = hasSetHeaders ? mergeHeaders(responseHeaders, context.set.headers) : responseHeaders
    if (isResponse(value)) {
      if (context.set.status !== undefined && value.status === 200) {
        return this.nativeResponseData({ ...value, status: context.set.status, headers: mergeHeaders(value.headers, context.set.headers) })
      }
      return this.nativeResponseData(hasSetHeaders ? { ...value, headers: mergeHeaders(value.headers, context.set.headers) } : value)
    }
    if (value instanceof Response) {
      if (context.set.status === undefined && !hasSetHeaders && responseHeaders.keys().next().done === true) return value
      return new Response(value.body, { status: context.set.status ?? value.status, headers: mergeHeaders(effectiveHeaders, Object.fromEntries(value.headers.entries())) })
    }
    const noResponseHeaders = responseHeaders.keys().next().done === true
    if (context.set.status === undefined && !hasSetHeaders && noResponseHeaders
      && value !== null && typeof value === "object" && !(value instanceof Uint8Array) && !(value instanceof ReadableStream)) {
      return new Response(JSON.stringify(value), { status: 200, headers: sharedNativeJsonHeaders })
    }
    const outputHeaders = !hasSetHeaders && noResponseHeaders ? sharedEmptyResponseHeaders : effectiveHeaders
    return this.nativeBodyResponse(context.set.status ?? 200, value, outputHeaders)
  }

  private finishSpecializedNativeSynchronousError(error: unknown): Response {
    if (error instanceof HttpError) return this.nativeBodyResponse(errorStatusOf(error), error.body ?? { error: error.message }, sharedEmptyResponseHeaders)
    throw error
  }

  private async handleReference(request: RequestData, prepared?: PreparedRequest): Promise<ResponseData> {
    if (this.modulePromises.length > 0) await this.waitForModules()
    const method = prepared?.method ?? fastNormalizeMethod(request.method)
    if (method === undefined) return this.response(400, { error: "Unsupported HTTP method" })
    // Q1: identical URL string parses identically. When the preflight was made
    // for this exact URL and method, reuse its normalized triple and skip the
    // second splitUrl/normalize entirely. Method is still compared because the
    // same URL can be requested with different methods.
    const candidate = prepared?.preflight ?? request.preflight
    let fastPreflight: Extract<import("./types.ts").RequestPreflight, { kind: "route" }> | undefined
    let normalized: string
    let search: string
    let rawPathname: string
    if (prepared !== undefined) {
      fastPreflight = prepared.preflight
      normalized = prepared.pathname
      search = prepared.search
      rawPathname = prepared.pathname
    } else if (
      candidate?.kind === "route" &&
      candidate.url === request.url &&
      candidate.method === method &&
      typeof candidate.pathname === "string" &&
      typeof candidate.search === "string"
    ) {
      fastPreflight = candidate
      normalized = candidate.pathname
      search = candidate.search
      // Mount precedence was already checked by preflight for this exact URL,
      // so the fallback branch below is unreachable on this path. Parse the
      // raw pathname lazily only if a future edit needs it.
      rawPathname = ""
    } else {
      fastPreflight = undefined
      const split = splitUrl(request.url)
      rawPathname = split.pathname
      normalized = normalizePathname(split.pathname)
      search = split.search
    }
    const pathname = rawPathname
    let route: RouteRecord | undefined
    let params: Record<string, string>
    const reusablePreflight = fastPreflight ?? (request.preflight?.kind === "route"
      && request.preflight.method === method
      && request.preflight.pathname === normalized
      && request.preflight.search === search
      ? request.preflight
      : undefined)
    if (prepared !== undefined) {
      route = prepared.route
      params = prepared.params
    } else if (reusablePreflight !== undefined) {
      // preflight already checked mount precedence, matched this route, and
      // ran request hooks/guards. Reuse its result instead of matching twice.
      route = reusablePreflight.route
      params = reusablePreflight.params
      // Context-free handlers never touch query/cookies/store/state, so skip
      // createContext, telemetry, and the lifecycle stages entirely. The
      // condition mirrors preflight: no hooks, guards, schemas, auth, or
      // app-level state that could change the visible response.
      if (this.canUseMinimalContext(route)) return this.handleMinimalContext(route, params, request, method)
    } else {
      const mounted = this.fetchMounts.find((entry) => matchesMount(entry.prefix, pathname))
      if (mounted !== undefined) {
        const target = request.rawRequest ?? new Request(toAbsoluteUrl(request.url), {
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
      // Hot path: O(1) static hit, single-split dynamic lookup within one method.
      const directRoute = this.staticRoutes.get(`${lookupMethod} ${normalized}`)
      if (directRoute !== undefined) {
        route = directRoute
        params = {}
      } else {
        const match = lookupDynamicPath(this.dynamicRoutes.get(lookupMethod) ?? EMPTY_ROUTES, normalized)
        if (match === undefined) {
          // Cold paths only: 404 / 405. Never scanned on a matched request.
          const actual = splitSegments(normalized)
          const allow = allowedMethodsFor(this.graph.routes, actual)
          if (method === "OPTIONS") {
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
    }
    // Direct handle() calls (app.inject, tests) carry no preflight. Same
    // minimal lane as above when the route needs no request context.
    if (reusablePreflight === undefined && route !== undefined && this.canUseMinimalContext(route)) {
      return this.handleMinimalContext(route, params, request, method)
    }
    const hasTelemetry = this.telemetry !== undefined
    const startedAt = hasTelemetry ? performance.now() : 0
    const preflight = reusablePreflight ?? (
      request.preflight?.kind === "route"
        && request.preflight.route === route
        && request.preflight.method === undefined
        && request.preflight.pathname === undefined
        && request.preflight.search === undefined
        ? request.preflight
        : undefined
    )
    const { context, responseHeaders } = preflight === undefined
      ? this.createContext(request, params, search, method)
      : { context: preflight.context, responseHeaders: preflight.responseHeaders }
    if (preflight !== undefined) {
      context.body = request.body
      // Same visible fields as the previous spread; mutating avoids one object
      // allocation per reused-preflight request.
      Object.assign(context.request, request, { headers: asHeaders(request.headers), body: request.body })
    }
    assignContextRoute(context, route)
    const requestId = context.requestId
    try {
      if (hasTelemetry) await this.emitTelemetryEvent({ phase: "request.start", requestId, method, route: route.path, durationMs: this.telemetryDuration(startedAt) })
      let parsedRequest = request
      if (hasTelemetry) await this.emitTelemetryEvent({ phase: "route.matched", requestId, method, route: route.path, durationMs: this.telemetryDuration(startedAt) })
      if (preflight === undefined) {
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
      }
      if (hasTelemetry) await this.emitTelemetryEvent({ phase: "parse", requestId, method, route: route.path, durationMs: this.telemetryDuration(startedAt) })
      for (const hook of route.parseHooks ?? []) {
        const parsed = await hook(parsedRequest, parsedRequest.headers?.get("content-type") ?? null)
        if (parsed !== undefined) {
          parsedRequest = { ...parsedRequest, body: parsed }
          context.body = parsed
        }
      }
      if (hasTelemetry) await this.telemetry?.onRequest?.(context)
      if (route.paramsSchema) context.params = await route.paramsSchema.validate(context.params) as Record<string, string>
      if (route.querySchema) context.query = asParsedQuery(await route.querySchema.validate(Object.fromEntries(context.query.entries())))
      if (route.headersSchema) context.headers = await route.headersSchema.validate(Object.fromEntries(context.headers.entries())) as Headers
      if (route.bodySchema) context.body = await route.bodySchema.validate(context.body)
      for (const hook of route.hooks) {
        // Sync hooks (the common case: no-op/undefined returns) skip the
        // await microtask tick. Thenables keep exact async semantics.
        const invoked = hook(context) as unknown
        const result = invoked !== null && (typeof invoked === "object" || typeof invoked === "function") && typeof (invoked as { then?: unknown }).then === "function" ? await invoked : invoked
        if (isResponse(result)) return result
        if (result instanceof Response) return responseFromNative(result, context.set)
      }
      if (hasTelemetry) await this.emitTelemetryEvent({ phase: "handler", requestId, method, route: route.path, durationMs: this.telemetryDuration(startedAt) })
      const result = context.executionControl === undefined
        ? await route.handler(context)
        : await context.executionControl.invoke(() => route.handler(context))
      if (result instanceof HttpError) throw result
      const hasSetHeaders = Object.keys(context.set.headers).length > 0
      const effectiveHeaders = hasSetHeaders ? mergeHeaders(responseHeaders, context.set.headers) : responseHeaders
       let response = isResponse(result)
        ? (context.set.status !== undefined && result.status === 200 ? { ...result, status: context.set.status, headers: mergeHeaders(result.headers, context.set.headers) } : (hasSetHeaders ? { ...result, headers: mergeHeaders(result.headers, context.set.headers) } : result))
        : result instanceof Response
        ? { status: context.set.status ?? result.status, headers: mergeHeaders(effectiveHeaders, Object.fromEntries(result.headers.entries())), body: result.body, [responseMarker]: true as const }
        : { status: context.set.status ?? 200, body: result, headers: effectiveHeaders, [responseMarker]: true as const }
       const responseSchema = route.responseSchemas?.[String(response.status)] ?? route.responseSchemas?.default ?? (response.status === 200 ? route.responseSchema : undefined)
       if (responseSchema) response.body = await responseSchema.validate(response.body, "response")
        // Hot path: benchmark/plain routes register no mapResponse hooks, so skip
        // the spread/filter/Set allocation entirely. Non-empty case keeps the
        // exact deduplicated order below.
        if ((route.mapResponseHooks?.length ?? 0) > 0 || this.mapResponseHooks.length > 0) {
          for (const hook of uniqueIdentity([...(route.mapResponseHooks ?? []), ...this.mapResponseHooks.filter((hook) => !this.localMapResponseHooks.includes(hook))])) {
            const mapped = await hook(context, response)
            if (isResponse(mapped)) response = mapped
            else if (mapped !== undefined) response.body = mapped
          }
        }
       for (const hook of route.afterHooks) await hook(context, response)
       if (hasTelemetry) {
         await this.telemetry?.onResponse?.(context, response)
         await this.emitTelemetryEvent({ phase: "response", requestId, method, route: route.path, status: response.status, durationMs: this.telemetryDuration(startedAt) })
         await this.exportTelemetrySpan({ name: `${method} ${route.path}`, requestId, method, route: route.path, status: response.status, durationMs: performance.now() - startedAt })
       }
         if ((route.afterResponseHooks?.length ?? 0) > 0 || this.afterResponseHooks.length > 0) {
           for (const hook of uniqueIdentity([...(route.afterResponseHooks ?? []), ...this.afterResponseHooks.filter((hook) => !this.localAfterResponseHooks.includes(hook))])) await hook(context, response)
         }
       if (hasTelemetry) await this.emitTelemetryEvent({ phase: "after.response", requestId, method, route: route.path, status: response.status, durationMs: this.telemetryDuration(startedAt) })
      return response
    } catch (error) {
      if (hasTelemetry) await this.telemetry?.onError?.(context, error)
      const errorStatus = errorStatusOf(error)
      if (hasTelemetry) {
        await this.emitTelemetryEvent({ phase: "error", requestId, method, route: route.path, status: errorStatus, durationMs: this.telemetryDuration(startedAt), error })
        await this.exportTelemetrySpan({ name: `${method} ${route.path}`, requestId, method, route: route.path, status: errorStatus, durationMs: performance.now() - startedAt, error })
      }
      context.set.status = errorStatus
      for (const handler of route.errorHandlers) {
        let result: unknown
        try { result = await handler(error, context) } catch { continue }
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
        return this.response(errorStatus, error.body ?? { error: error.message })
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
    const match = direct === undefined ? lookupDynamicPath(this.dynamicRoutes.get(lookupMethod) ?? EMPTY_ROUTES, normalized) : undefined
    const route = direct ?? match?.route
    const { context, responseHeaders } = this.createContext(request, match?.params ?? {}, search, method)
    const errorStatus = errorStatusOf(error)
    context.set.status = errorStatus
    await this.telemetry?.onError?.(context, error)
    await this.exportTelemetrySpan({ name: `${method} ${route?.path ?? pathname}`, requestId: context.requestId, method, route: route?.path ?? pathname, status: errorStatus, durationMs: 0, error })
    const handlers = route?.errorHandlers ?? this.errorHandlers
    for (const handler of uniqueIdentity(handlers)) {
      let result: unknown
      try { result = await handler(error, context) } catch { continue }
      if (isResponse(result)) return result
      if (result instanceof Response) return responseFromNative(result, context.set, responseHeaders)
      if (result !== undefined) return { status: context.set.status ?? 500, body: result, headers: mergeHeaders(responseHeaders, context.set.headers), [responseMarker]: true }
    }
    const status = errorStatus
    return this.response(status, { error: status === 500 ? "Internal Server Error" : error instanceof Error ? error.message : "Bad Request" }, Object.fromEntries(responseHeaders.entries()))
  }

  response(body: unknown, options?: ResponseOptions): ResponseData
  response(status: number, body: unknown, headers?: Record<string, string>): ResponseData
  response(bodyOrStatus: unknown, optionsOrBody?: ResponseOptions | unknown, extraHeaders?: Record<string, string>): ResponseData {
    return createContextResponse(new Headers(), bodyOrStatus, optionsOrBody, extraHeaders)
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

function fastPathname(input: string): string {
  // Most adapter URLs have a normal host, so starting after the scheme and
  // the first host characters avoids scanning the same prefix on every hit.
  // Keep the short-host fallback for tests and relative Web Requests.
  const relative = input.charCodeAt(0) === 47
  let start = relative ? 0 : input.indexOf("/", 11)
  if (start === -1 && !relative) start = input.indexOf("/", 7)
  if (start === -1) return "/"
  const queryIndex = input.indexOf("?", start)
  return queryIndex === -1
    ? input.slice(start) || "/"
    : queryIndex === start ? "/" : input.slice(start, queryIndex)
}

function applyPathParams(input: string, params?: Record<string, string>): string {
  if (params === undefined) return input
  const queryIndex = input.indexOf("?")
  const pathname = queryIndex === -1 ? input : input.slice(0, queryIndex)
  const search = queryIndex === -1 ? "" : input.slice(queryIndex)
  const expanded = pathname
    .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
      const value = params[name]
      return value === undefined ? `:${name}` : encodeURIComponent(value)
    })
    .replace(/\/\*$/, () => params["*"] === undefined ? "/*" : `/${encodeURIComponent(params["*"])}`)
  return expanded + search
}

export { HttpError }

function authMatchesStrategy(auth: RouteRecord["auth"], name: string): boolean {
  if (auth === true) return true
  if (typeof auth === "string") return auth === name
  return typeof auth === "object" && auth !== null && auth.strategy === name
}

function authDescriptorValue(auth: AuthStrategySetting | undefined, key: "role" | "permissions"): string | readonly string[] | undefined {
  if (typeof auth !== "object" || auth === null) return undefined
  return auth[key]
}

function routeFeaturesFrom(options: { rateLimit?: RateLimitRouteOptions | `${number}/${"s" | "m" | "h"}` | false; cache?: unknown; timeout?: unknown; features?: Record<string, unknown> }): Record<string, unknown> {
  const features: Record<string, unknown> = {}
  if (options.rateLimit !== undefined) features.rateLimit = options.rateLimit
  if (options.cache !== undefined) features.cache = options.cache
  if (options.timeout !== undefined) features.timeout = options.timeout
  for (const [name, value] of Object.entries(options.features ?? {})) {
    if (features[name] === undefined) features[name] = value
  }
  return features
}

/** Merge only route metadata. Request/response schemas and lifecycle hooks are
 * intentionally excluded because they have different inheritance rules. */
function mergeRouteMetadata(parent: RouteMetadataOptions, child: Partial<RouteMetadataOptions>): RouteMetadataOptions {
  const merged = cloneRouteMetadata(parent)
  const scalarKeys: Array<keyof RouteMetadataOptions> = ["auth", "role", "permissions", "rateLimit", "cache", "timeout"]
  for (const key of scalarKeys) {
    const value = child[key]
    if (value !== undefined) {
      const parentValue = merged[key]
      ;(merged as Record<string, unknown>)[key] = mergeMetadataValue(parentValue, value)
    }
  }
  if (child.features !== undefined) {
    const features = { ...(merged.features ?? {}) }
    for (const [name, value] of Object.entries(child.features)) {
      features[name] = mergeMetadataValue(features[name], value)
    }
    merged.features = features
  }
  return merged
}

function cloneRouteMetadata(value: RouteMetadataOptions): RouteMetadataOptions {
  const auth = copyMetadataRecord(value.auth)
  const rateLimit = copyMetadataRecord(value.rateLimit)
  const cache = copyMetadataRecord(value.cache)
  const timeout = copyMetadataRecord(value.timeout)
  return {
    ...value,
    ...(auth === undefined ? {} : { auth: auth as unknown as AuthStrategyDescriptor }),
    ...(rateLimit === undefined ? {} : { rateLimit: rateLimit as unknown as RateLimitRouteOptions }),
    ...(cache === undefined ? {} : { cache: cache as unknown as NonNullable<RouteMetadataOptions["cache"]> }),
    ...(timeout === undefined ? {} : { timeout: timeout as unknown as NonNullable<RouteMetadataOptions["timeout"]> }),
    ...(value.features === undefined ? {} : { features: { ...value.features } })
  }
}

function copyMetadataRecord(value: unknown): Record<string, unknown> | undefined {
  return isPlainRecord(value) ? { ...value } : undefined
}

function mergeMetadataValue(parent: unknown, child: unknown): unknown {
  return isPlainRecord(parent) && isPlainRecord(child) ? { ...parent, ...child } : child
}

function normalizeRouteMetadata(route: RouteRecord): NormalizedRouteMetadata {
  const features = { ...(route.features ?? {}) }
  return {
    auth: route.auth,
    role: route.role,
    permissions: route.permissions,
    rateLimit: features.rateLimit as NormalizedRouteMetadata["rateLimit"],
    cache: features.cache as NormalizedRouteMetadata["cache"],
    timeout: features.timeout as NormalizedRouteMetadata["timeout"],
    features
  }
}

function mergeFeatureValue(parent: unknown, child: unknown): unknown {
  if (isPlainRecord(parent) && isPlainRecord(child)) return { ...parent, ...child }
  return child
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isResponseDefinitionMap(value: unknown): value is Record<string | number, SchemaInput> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  if ("validate" in value || "~standard" in value) return false
  return Object.keys(value).every((key) => key === "default" || /^(?:[1-5]\d\d)$/.test(key))
}

function mergeResponseDefinitions(
  primary: Record<string | number, SchemaInput> | undefined,
  secondary: Record<string | number, SchemaInput> | undefined
): Record<string | number, SchemaInput> | undefined {
  if (primary === undefined && secondary === undefined) return undefined
  const output: Record<string | number, SchemaInput> = { ...(primary ?? {}) }
  for (const [status, schema] of Object.entries(secondary ?? {})) {
    if (Object.prototype.hasOwnProperty.call(output, status)) throw new Error(`Conflicting response schema for status ${status}`)
    output[status] = schema
  }
  return output
}

function authorizeRoute(context: Context, route: RouteRecord): ResponseData | void {
  // A role/permission policy is an authentication boundary even when the
  // caller omitted the explicit `auth` shorthand. An anonymous request must
  // therefore receive 401 before policy evaluation can produce 403.
  const requiredAuth = (route.auth !== undefined && route.auth !== false) || route.role !== undefined || route.permissions !== undefined
  const claims = context.auth
  if (requiredAuth && claims === undefined) return context.response(401, { error: "Unauthorized" })
  if (route.role === undefined && route.permissions === undefined) return

  const source = claims && typeof claims === "object" ? claims as Record<string, unknown> : {}
  const permissionApi = (context as Context & { permissions?: { roles?: readonly string[]; has?(role: string): boolean; can?(permission: string): boolean } }).permissions
  const claimRoles = source.roles
  const roles = new Set<string>([
    ...(permissionApi?.roles ?? []),
    ...(typeof source.role === "string" ? [source.role] : Array.isArray(source.role) ? source.role.filter((value): value is string => typeof value === "string") : []),
    ...(Array.isArray(claimRoles) ? claimRoles.filter((value): value is string => typeof value === "string") : [])
  ])
  const requiredRoles = route.role === undefined ? [] : typeof route.role === "string" ? [route.role] : [...route.role]
  if (requiredRoles.length > 0 && !requiredRoles.some((role) => permissionApi?.has?.(role) ?? roles.has(role))) {
    return context.response(403, { error: "Forbidden" })
  }

  const requiredPermissions = route.permissions === undefined ? [] : typeof route.permissions === "string" ? [route.permissions] : [...route.permissions]
  const claimPermissions = new Set(Array.isArray(source.permissions) ? source.permissions.filter((value): value is string => typeof value === "string") : [])
  if (requiredPermissions.some((permission) => !(permissionApi?.can?.(permission) ?? claimPermissions.has(permission)))) {
    return context.response(403, { error: "Forbidden" })
  }
}

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

function errorStatusOf(error: unknown): number {
  if (error instanceof HttpError) return error.status
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status
    if (typeof status === "number" && Number.isInteger(status) && status >= 400 && status <= 599) return status
  }
  return 500
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

function createContextResponse(base: Headers, bodyOrStatus: unknown, optionsOrBody?: ResponseOptions | unknown, extraHeaders?: Record<string, string>): ResponseData {
  const bodyFirst = typeof bodyOrStatus !== "number" || (extraHeaders === undefined && isResponseOptions(optionsOrBody))
  if (!bodyFirst) {
    return { status: bodyOrStatus as number, body: optionsOrBody, headers: mergeHeaders(base, extraHeaders), [responseMarker]: true }
  }
  const options = optionsOrBody as ResponseOptions | undefined
  return { status: options?.status ?? 200, body: bodyOrStatus, headers: mergeHeaders(base, options?.headers), [responseMarker]: true }
}

function cloneStaticValue(value: unknown): unknown {
  return value instanceof Response ? value.clone() : value
}

function isResponseOptions(value: unknown): value is ResponseOptions {
  return typeof value === "object" && value !== null && (("status" in value && (value as { status?: unknown }).status !== undefined && typeof (value as { status?: unknown }).status === "number") || "headers" in value)
}

function mergeHeaders(base: Headers, extra?: HeadersInit): Headers {
  const headers = new Headers(base)
  for (const [key, value] of new Headers(extra)) headers.set(key, value)
  return headers
}

function uniqueHooks(hooks: Hook[]): Hook[] {
  return uniqueIdentity(hooks)
}

function uniqueIdentity<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function isNelysia(value: unknown): value is Nelysia<any, any, any> {
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
