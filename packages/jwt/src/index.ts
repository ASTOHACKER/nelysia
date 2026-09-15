import type { Context, Nelysia, NelysiaPlugin, ResponseData } from "../../core/src/index.ts"

declare module "../../core/src/types.ts" {
  interface AuthStrategyRegistry {
    jwt: JwtPayload
  }
}

export interface JwtOptions<Claims extends JwtPayload = JwtPayload> {
  secret: string
  name?: string
  alg?: "HS256"
  expiresIn?: number
  headerName?: string
  issuer?: string
  audience?: string | string[]
}

export interface JwtPayload {
  [key: string]: unknown
  sub?: string
  iss?: string
  aud?: string | string[]
  exp?: number
  nbf?: number
  iat?: number
}

export interface JwtContext<Claims extends JwtPayload = JwtPayload> {
  jwt: JwtPluginInstance<Claims>
  auth?: Claims
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

function base64UrlDecode(str: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) throw new Error("invalid base64url characters")
  if (str.length % 4 === 1) throw new Error("invalid base64url length")
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  while (base64.length % 4) {
    base64 += "="
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  // Reject alternate encodings with non-zero unused padding bits. This keeps
  // signed input canonical and avoids accepting malformed segment aliases.
  if (base64UrlEncode(bytes) !== str) throw new Error("non-canonical base64url segment")
  return bytes
}

export async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  )
}

export async function signJwt(
  payload: JwtPayload,
  keyOrSecret: CryptoKey | string,
  options?: { expiresIn?: number }
): Promise<string> {
  const key = typeof keyOrSecret === "string" ? await importHmacKey(keyOrSecret) : keyOrSecret
  const enc = new TextEncoder()
  const header = { alg: "HS256", typ: "JWT" }

  const now = Math.floor(Date.now() / 1000)
  const fullPayload: JwtPayload = { iat: now, ...payload }
  if (options?.expiresIn !== undefined && fullPayload.exp === undefined) {
    fullPayload.exp = now + options.expiresIn
  }

  const encodedHeader = base64UrlEncode(enc.encode(JSON.stringify(header)))
  const encodedPayload = base64UrlEncode(enc.encode(JSON.stringify(fullPayload)))
  const data = `${encodedHeader}.${encodedPayload}`

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(data))
  const encodedSignature = base64UrlEncode(new Uint8Array(signature))

  return `${data}.${encodedSignature}`
}

export interface JwtVerifyOptions {
  issuer?: string
  audience?: string | string[]
}

function decodeBase64UrlJson<T>(value: string): T {
  if (value.length === 0 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid base64url segment")
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(base64UrlDecode(value))
  return JSON.parse(decoded) as T
}

function audienceMatches(actual: JwtPayload["aud"], expected: string | string[]): boolean {
  if (actual !== undefined && typeof actual !== "string" && !(Array.isArray(actual) && actual.every((value) => typeof value === "string"))) return false
  const values = Array.isArray(actual) ? actual : typeof actual === "string" ? [actual] : []
  const expectedValues = Array.isArray(expected) ? expected : [expected]
  return values.some((value) => expectedValues.includes(value))
}

export async function verifyJwt<T extends JwtPayload = JwtPayload>(
  token: string,
  keyOrSecret: CryptoKey | string,
  options: JwtVerifyOptions = {}
): Promise<{ valid: boolean; payload?: T; reason?: "invalid" | "expired" | "malformed" }> {
  const parts = token.split(".")
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return { valid: false, reason: "malformed" }
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts

  try {
    const header = decodeBase64UrlJson<{ alg?: unknown }>(encodedHeader)
    if (header.alg !== "HS256") return { valid: false, reason: "invalid" }
    const key = typeof keyOrSecret === "string" ? await importHmacKey(keyOrSecret) : keyOrSecret
    const enc = new TextEncoder()
    const data = `${encodedHeader}.${encodedPayload}`
    if (!/^[A-Za-z0-9_-]+$/.test(encodedSignature)) return { valid: false, reason: "malformed" }
    const signature = base64UrlDecode(encodedSignature)
    const isValid = await crypto.subtle.verify("HMAC", key, signature as unknown as BufferSource, enc.encode(data))
    if (!isValid) return { valid: false, reason: "invalid" }

    const payload = decodeBase64UrlJson<T>(encodedPayload)
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return { valid: false, reason: "malformed" }

    const claims = payload as JwtPayload
    if (claims.iss !== undefined && typeof claims.iss !== "string") return { valid: false, payload, reason: "invalid" }
    if (claims.aud !== undefined && typeof claims.aud !== "string" && !(Array.isArray(claims.aud) && claims.aud.every((value) => typeof value === "string"))) {
      return { valid: false, payload, reason: "invalid" }
    }
    if (claims.iat !== undefined && (typeof claims.iat !== "number" || !Number.isFinite(claims.iat))) {
      return { valid: false, payload, reason: "invalid" }
    }

    if (options.issuer !== undefined && claims.iss !== options.issuer) {
      return { valid: false, payload, reason: "invalid" }
    }
    if (options.audience !== undefined && !audienceMatches(claims.aud, options.audience)) {
      return { valid: false, payload, reason: "invalid" }
    }

    if (claims.exp !== undefined) {
      if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp)) return { valid: false, payload, reason: "invalid" }
      const now = Math.floor(Date.now() / 1000)
      if (now >= claims.exp) {
        return { valid: false, payload, reason: "expired" }
      }
    }

    if (claims.nbf !== undefined) {
      if (typeof claims.nbf !== "number" || !Number.isFinite(claims.nbf)) return { valid: false, payload, reason: "invalid" }
      const now = Math.floor(Date.now() / 1000)
      if (now < claims.nbf) {
        return { valid: false, payload, reason: "invalid" }
      }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false, reason: "malformed" }
  }
}

export interface JwtPluginInstance<Claims extends JwtPayload = JwtPayload> {
  sign(payload: Claims, options?: { expiresIn?: number }): Promise<string>
  verify<T extends Claims = Claims>(token: string, options?: JwtVerifyOptions): Promise<{ valid: boolean; payload?: T; reason?: "invalid" | "expired" | "malformed" }>
}

export type JwtPlugin<Claims extends JwtPayload = JwtPayload> = NelysiaPlugin<JwtContext<Claims>>

export function jwt<Claims extends JwtPayload = JwtPayload>(options: JwtOptions<Claims>): JwtPlugin<Claims> {
  if (typeof options.secret !== "string" || options.secret.length === 0) throw new Error("jwt secret must not be empty")
  if (options.expiresIn !== undefined && (!Number.isFinite(options.expiresIn) || options.expiresIn <= 0)) throw new Error("jwt expiresIn must be positive")
  const headerName = (options.headerName ?? "authorization").toLowerCase()
  const keyPromise = importHmacKey(options.secret)
  const verifyOptions: JwtVerifyOptions = { issuer: options.issuer, audience: options.audience }

  const pluginInstance: JwtPluginInstance<Claims> = {
    async sign(payload: Claims, signOptions?: { expiresIn?: number }): Promise<string> {
      const key = await keyPromise
      return signJwt(payload, key, { expiresIn: signOptions?.expiresIn ?? options.expiresIn })
    },
    async verify<T extends Claims = Claims>(token: string, verifyOverrides?: JwtVerifyOptions) {
      const key = await keyPromise
      return verifyJwt<T>(token, key, verifyOverrides ?? verifyOptions)
    }
  }

  return ((app: Nelysia<any, any, any>) => {
    // Attach jwt instance to app
    ;(app as unknown as Record<string, unknown>)[options.name ?? "jwt"] = pluginInstance
    app.decorate("jwt", pluginInstance, { enumerable: false, lazy: true })

    // Register before-hook specifically for routes declared with auth: "jwt" or auth: true
    const authHook = async (context: Context): Promise<ResponseData | void> => {
      const authHeader = context.headers.get(headerName)
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        if (isOptionalAuth(context)) return
        return context.response(401, {
          error: "Unauthorized",
          message: "Missing or invalid authorization header"
        })
      }

      const token = authHeader.slice(7).trim()
      const key = await keyPromise
      const verification = await verifyJwt(token, key, verifyOptions)

      if (!verification.valid) {
        const message = verification.reason === "expired" ? "Token expired" : "Invalid token"
        return context.response(401, {
          error: "Unauthorized",
          message
        })
      }

      context.auth = verification.payload as Claims | undefined
    }

    // Register a route-scoped guard instead of wrapping every protected handler.
    app.registerAuthStrategy("jwt", { guard: authHook })

    return app as Nelysia<any, any, any>
  }) as JwtPlugin<Claims>
}

function isOptionalAuth(context: Context): boolean {
  const auth = context.route?.auth
  return typeof auth === "object" && auth !== null && auth.optional === true
}
