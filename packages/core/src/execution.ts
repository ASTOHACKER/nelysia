import type { AfterHook, AfterResponseHook, Context, ErrorHandler, Hook, MapResponseHook, RequestData, RequestPreflight, ResponseData, RouteRecord } from "./types.ts"

export type RuntimeLane = "minimal" | "specialized" | "generic"

export type ContextField =
  | "request" | "requestId" | "clientIp" | "env" | "executionContext" | "params" | "query"
  | "set" | "store" | "body" | "headers" | "cookies" | "auth" | "route" | "signal"
  | "executionControl" | "logger" | "files" | "setCookie" | "deleteCookie" | "response"
  | "html" | "text" | "json" | "redirect" | "header"

export interface ContextNeeds {
  readonly full: boolean
  /** Keep own-key semantics for handlers that explicitly enumerate context. */
  readonly ownProperties: boolean
  readonly fields: readonly ContextField[]
  has(field: ContextField): boolean
}

export interface ExecutionPlan {
  readonly lane: RuntimeLane
  /** A full-context route can still use the precomputed stage runner when
   * no request/schema/provider stage needs the reference dispatcher. */
  readonly pipelineSafe: boolean
  readonly contextFreePipeline: boolean
  readonly needs: ContextNeeds
  readonly handler: RouteRecord["handler"]
  readonly hooks: readonly Hook[]
  readonly nativeHooks: readonly Hook[]
  readonly afterHooks: readonly AfterHook[]
  readonly mapResponseHooks: readonly MapResponseHook[]
  readonly afterResponseHooks: readonly AfterResponseHook[]
  readonly errorHandlers: readonly ErrorHandler[]
  readonly allSynchronous: boolean
}

export interface PreparedRequest {
  readonly request: RequestData
  readonly route: RouteRecord
  readonly params: Record<string, string>
  readonly method: string
  readonly pathname: string
  readonly search: string
  readonly plan: ExecutionPlan
  readonly preflight?: Extract<RequestPreflight, { kind: "route" }>
}

export interface RuntimeExecutor {
  preflight(request: RequestData): RequestPreflight | Promise<RequestPreflight>
  handle(request: RequestData): ResponseData | Promise<ResponseData>
  /** Native adapter lane for context-free routes; undefined delegates to handle. */
  handleNative?(request: RequestData): Response | Promise<Response> | undefined
  /** Same lane without materializing RequestData for a native Web request. */
  handleNativeRequest?(request: Request, requestId?: string): Response | Promise<Response> | undefined
}

const executors = new WeakMap<object, RuntimeExecutor>()

export function registerRuntimeExecutor(app: object, executor: RuntimeExecutor): void {
  executors.set(app, executor)
}

export function getRuntimeExecutor(app: object): RuntimeExecutor | undefined {
  return executors.get(app)
}

export interface RuntimeComposition {
  readonly telemetry: boolean
  readonly modulesPending: boolean
  readonly mounts: boolean
  readonly contextValues: boolean
  readonly contextExtensions: boolean
}

export interface ContextInference {
  readonly known: boolean
  readonly fields: readonly ContextField[]
  readonly asynchronous: boolean
  readonly ownProperties: boolean
}

const contextFields = new Set<ContextField>([
  "request", "requestId", "clientIp", "env", "executionContext", "params", "query", "set", "store", "body",
  "headers", "cookies", "auth", "route", "signal", "executionControl", "logger", "files", "setCookie",
  "deleteCookie", "response", "html", "text", "json", "redirect", "header"
])

const asyncFunctionPattern = /^\s*(?:async\s+)?function\b|^\s*async(?:\s*\([^)]*\)|\s+[A-Za-z_$][\w$]*)\s*=>/

export function isDeclaredAsync(value: unknown): boolean {
  return typeof value === "function" && asyncFunctionPattern.test(Function.prototype.toString.call(value))
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return false
  return typeof (value as { then?: unknown }).then === "function"
}

export function inferContext(value: unknown, parameterIndex = 0): ContextInference {
  if (typeof value !== "function") return { known: false, fields: [], asynchronous: false, ownProperties: true }
  const source = Function.prototype.toString.call(value)
  const parameters = functionParameters(source)
  const parameter = parameters[parameterIndex]
  if (parameter === undefined) return { known: true, fields: [], asynchronous: isDeclaredAsync(value), ownProperties: false }
  const trimmed = parameter.trim()
  if (!trimmed.startsWith("{")) {
    if (parameterIndex === 0 && isNamedParamsOnlySource(source, trimmed)) {
      return { known: true, fields: ["params"], asynchronous: isDeclaredAsync(value), ownProperties: false }
    }
    const literalFields = inferLiteralContextFields(source, trimmed)
    if (literalFields !== undefined) {
      return { known: true, fields: literalFields, asynchronous: isDeclaredAsync(value), ownProperties: false }
    }
    return { known: false, fields: [], asynchronous: isDeclaredAsync(value), ownProperties: contextUsesOwnProperties(source) }
  }
  if (!trimmed.endsWith("}")) return { known: false, fields: [], asynchronous: isDeclaredAsync(value), ownProperties: contextUsesOwnProperties(source) }
  const content = trimmed.slice(1, -1).trim()
  if (content === "") return { known: true, fields: [], asynchronous: isDeclaredAsync(value), ownProperties: false }
  const fields: ContextField[] = []
  for (const token of content.split(",")) {
    const name = token.trim()
    if (!name || name.startsWith("...") || name.includes(":" ) || name.includes("=") || !contextFields.has(name as ContextField)) {
      return { known: false, fields: [], asynchronous: isDeclaredAsync(value), ownProperties: contextUsesOwnProperties(source) || name.startsWith("...") }
    }
    fields.push(name as ContextField)
  }
  return { known: true, fields: [...new Set(fields)], asynchronous: isDeclaredAsync(value), ownProperties: false }
}

export function createExecutionPlan(route: RouteRecord, composition: RuntimeComposition): ExecutionPlan {
  const hooks = [...route.hooks]
  const afterHooks = [...route.afterHooks]
  const mapResponseHooks = [...(route.mapResponseHooks ?? [])]
  const afterResponseHooks = [...(route.afterResponseHooks ?? [])]
  const errorHandlers = [...route.errorHandlers]
  const allFunctions = [route.handler, ...hooks, ...afterHooks, ...mapResponseHooks, ...afterResponseHooks, ...errorHandlers]
  const fields = new Set<ContextField>()
  let known = true
  let asynchronous = false
  let ownProperties = false
  const add = (inference: ContextInference): void => {
    if (!inference.known) known = false
    for (const field of inference.fields) fields.add(field)
    asynchronous ||= inference.asynchronous
    ownProperties ||= inference.ownProperties
  }
  add(inferContext(route.handler))
  for (const hook of hooks) add(inferContext(hook))
  for (const hook of afterHooks) add(inferContext(hook))
  for (const hook of mapResponseHooks) add(inferContext(hook))
  for (const hook of afterResponseHooks) add(inferContext(hook))
  for (const handler of errorHandlers) add(inferContext(handler, 1))

  const hasSchemas = route.bodySchema !== undefined || route.paramsSchema !== undefined || route.querySchema !== undefined
    || route.headersSchema !== undefined || route.responseSchema !== undefined
    || (route.responseSchemas !== undefined && Object.keys(route.responseSchemas).length > 0)
  const hasRouteMetadata = route.auth !== undefined || route.role !== undefined || route.permissions !== undefined
    || (route.features !== undefined && Object.keys(route.features).length > 0)
  // Empty request/parse/guard callbacks cannot observe or change a request.
  // Treat them like empty beforeHandle hooks so bodyless native requests do
  // not pay for an otherwise unnecessary adapter preflight.
  const hasRequestStages = (route.requestHooks?.some((hook) => !isStaticallyNoop(hook)) ?? false)
    || (route.parseHooks?.some((hook) => !isStaticallyNoop(hook)) ?? false)
    || (route.routeGuards?.some((hook) => !isStaticallyNoop(hook)) ?? false)
  const hasUnsupportedComposition = composition.telemetry || composition.modulesPending || composition.mounts || composition.contextValues || composition.contextExtensions
  const pipelineSafe = !hasUnsupportedComposition && !hasSchemas && !hasRouteMetadata && !hasRequestStages
  const canSpecialize = pipelineSafe && known
  const minimalContext = fields.size === 0
    || (fields.size === 1 && fields.has("params") && isParamsOnlyHandler(route.handler))
  const canBeMinimal = canSpecialize && hooks.length === 0 && afterHooks.length === 0 && mapResponseHooks.length === 0
    && afterResponseHooks.length === 0 && errorHandlers.length === 0 && minimalContext
    && (route.handler.length === 0 || isParamsOnlyHandler(route.handler))
  const contextFreePipeline = canSpecialize
    && ((fields.size === 0 && route.handler.length === 0) || (fields.size === 1 && fields.has("params") && isParamsOnlyHandler(route.handler)))
    && hooks.every((hook) => hook.length === 0) && afterHooks.length === 0 && mapResponseHooks.length === 0
    && afterResponseHooks.length === 0 && errorHandlers.length === 0
  const lane: RuntimeLane = canBeMinimal ? "minimal" : canSpecialize ? "specialized" : "generic"
  const needs: ContextNeeds = createNeeds(!canSpecialize, fields, ownProperties)
  return Object.freeze({
    lane,
    pipelineSafe,
    contextFreePipeline,
    needs,
    handler: route.handler,
    hooks: Object.freeze(hooks),
    nativeHooks: Object.freeze(hooks.filter((hook) => !isStaticallyNoop(hook))),
    afterHooks: Object.freeze(afterHooks),
    mapResponseHooks: Object.freeze(mapResponseHooks),
    afterResponseHooks: Object.freeze(afterResponseHooks),
    errorHandlers: Object.freeze(errorHandlers),
    allSynchronous: !asynchronous && allFunctions.every((fn) => !isDeclaredAsync(fn))
  })
}

/** Empty lifecycle callbacks are semantically inert. Keep them in the route
 * plan for the reference executor, but omit them from the native hot lane. */
function isStaticallyNoop(value: unknown): boolean {
  if (typeof value !== "function") return false
  const source = Function.prototype.toString.call(value).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").trim()
  return /^(?:async\s+)?(?:function(?:\s+[\w$]+)?\s*\([^)]*\)|(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>)\s*\{\s*\}$/.test(source)
}

function createNeeds(full: boolean, fields: Set<ContextField>, ownProperties: boolean): ContextNeeds {
  const list = Object.freeze([...fields])
  return Object.freeze({
    full,
    ownProperties,
    fields: list,
    has(field: ContextField): boolean { return full || fields.has(field) }
  })
}

/**
 * A lazy full context may provide every field through the shared prototype,
 * but explicit own-key inspection is observable. Keep those handlers on the
 * eager literal path so Object.keys/spread/for-in behavior remains exact.
 */
function contextUsesOwnProperties(source: string): boolean {
  return /Object\.(?:keys|getOwnPropertyNames|getOwnPropertySymbols|getOwnPropertyDescriptor|assign)\s*\(/.test(source)
    || /Reflect\.ownKeys\s*\(/.test(source)
    || /\.hasOwnProperty\s*\(/.test(source)
    || /\.\.\.\s*[A-Za-z_$][\w$]*/.test(source)
    || /for\s*\([^)]*\bin\b/.test(source)
}

/** Recognize direct member access, including a quoted literal key. A key
 * supplied by another variable deliberately remains opaque. */
function inferLiteralContextFields(source: string, parameter: string): ContextField[] | undefined {
  if (!/^[A-Za-z_$][\w$]*$/.test(parameter)) return undefined
  const escaped = parameter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const arrow = source.indexOf("=>")
  const body = arrow === -1 ? source.slice(source.indexOf(")") + 1) : source.slice(arrow + 2)
  const access = new RegExp(`\\b${escaped}\\s*(?:\\.\\s*([A-Za-z_$][\\w$]*)|\\[\\s*(['"])([A-Za-z_$][\\w$]*)\\2\\s*\\])`, "g")
  const fields: ContextField[] = []
  let matched = false
  const withoutAccess = body.replace(access, (_match, dotField: string | undefined, _quote: string | undefined, literalField: string | undefined) => {
    const field = dotField ?? literalField
    if (field !== undefined && contextFields.has(field as ContextField)) {
      matched = true
      fields.push(field as ContextField)
    }
    return ""
  })
  if (!matched || new RegExp(`\\b${escaped}\\b`).test(withoutAccess)) return undefined
  return [...new Set(fields)]
}

function functionParameters(source: string): string[] {
  const arrow = source.match(/^[\s\S]*?=>/)
  if (arrow !== null) {
    const head = arrow[0].slice(0, -2).trim().replace(/^async\s+/, "")
    if (head.startsWith("(") && head.endsWith(")")) return splitParameters(head.slice(1, -1))
    return [head]
  }
  const open = source.indexOf("(")
  if (open === -1) return []
  const close = matchingParen(source, open)
  return close === -1 ? [] : splitParameters(source.slice(open + 1, close))
}

function splitParameters(value: string): string[] {
  const output: string[] = []
  let start = 0
  let depth = 0
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === "{" || char === "[" || char === "(") depth++
    else if (char === "}" || char === "]" || char === ")") depth--
    else if (char === "," && depth === 0) {
      output.push(value.slice(start, index))
      start = index + 1
    }
  }
  if (start < value.length) output.push(value.slice(start))
  return output
}

function matchingParen(value: string, start: number): number {
  let depth = 0
  for (let index = start; index < value.length; index++) {
    if (value[index] === "(") depth++
    else if (value[index] === ")" && --depth === 0) return index
  }
  return -1
}

function isParamsOnlyHandler(handler: RouteRecord["handler"]): boolean {
  const source = Function.prototype.toString.call(handler)
  if (/^(?:async\s*)?\(\s*\{\s*params\s*\}\s*\)\s*=>/.test(source)
    || /^(?:async\s*)?function(?:\s+[\w$]+)?\s*\(\s*\{\s*params\s*\}\s*\)/.test(source)) return true
  const arrowParameter = source.match(/^(?:async\s*)?\(\s*([A-Za-z_$][\w$]*)\s*\)\s*=>/)
    ?? source.match(/^(?:async\s+)?([A-Za-z_$][\w$]*)\s*=>/)
  if (arrowParameter !== null) return isNamedParamsOnlySource(source, arrowParameter[1]!)
  const functionParameter = source.match(/^(?:async\s+)?function(?:\s+[\w$]+)?\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/)
  return functionParameter === null ? false : isNamedParamsOnlySource(source, functionParameter[1]!)
}

/** Recognize only the narrow `context.params...` shape. Computed access,
 * aliases, and any second context field remain generic by design. */
function isNamedParamsOnlySource(source: string, parameter: string): boolean {
  if (!/^[A-Za-z_$][\w$]*$/.test(parameter)) return false
  const escaped = parameter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const paramsAccess = new RegExp(`\\b${escaped}\\s*\\.\\s*params\\b`)
  const arrow = source.indexOf("=>")
  const body = arrow === -1
    ? source.slice(source.indexOf(")") + 1)
    : source.slice(arrow + 2)
  if (!paramsAccess.test(body)) return false
  const withoutParamsAccess = body.replace(new RegExp(`\\b${escaped}\\s*\\.\\s*params\\b`, "g"), "")
  return !new RegExp(`\\b${escaped}\\b`).test(withoutParamsAccess)
}
