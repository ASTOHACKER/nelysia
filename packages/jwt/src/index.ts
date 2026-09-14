import type { Context, Nelysia, ResponseData } from "../../core/src/index.ts"

export interface JwtOptions {
  secret: string
  name?: string
  alg?: "HS256"
  expiresIn?: number
  headerName?: string
}

export interface JwtPayload {
  [key: string]: unknown
  sub?: string
  iss?: string
  aud?: string
  exp?: number
  nbf?: number
  iat?: number
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/")
  while (base64.length % 4) {
    base64 += "="
  }
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
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

export async function verifyJwt<T extends JwtPayload = JwtPayload>(
  token: string,
  keyOrSecret: CryptoKey | string
): Promise<{ valid: boolean; payload?: T; reason?: "invalid" | "expired" | "malformed" }> {
  const parts = token.split(".")
  if (parts.length !== 3) {
    return { valid: false, reason: "malformed" }
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const key = typeof keyOrSecret === "string" ? await importHmacKey(keyOrSecret) : keyOrSecret
  const enc = new TextEncoder()

  try {
    const data = `${encodedHeader}.${encodedPayload}`
    const signature = base64UrlDecode(encodedSignature)
    const isValid = await crypto.subtle.verify("HMAC", key, signature as unknown as BufferSource, enc.encode(data))
    if (!isValid) return { valid: false, reason: "invalid" }

    const payloadJson = new TextDecoder().decode(base64UrlDecode(encodedPayload))
    const payload = JSON.parse(payloadJson) as T

    if (payload.exp !== undefined) {
      const now = Math.floor(Date.now() / 1000)
      if (now >= payload.exp) {
        return { valid: false, payload, reason: "expired" }
      }
    }

    if (payload.nbf !== undefined) {
      const now = Math.floor(Date.now() / 1000)
      if (now < payload.nbf) {
        return { valid: false, payload, reason: "invalid" }
      }
    }

    return { valid: true, payload }
  } catch {
    return { valid: false, reason: "malformed" }
  }
}

export interface JwtPluginInstance {
  sign(payload: JwtPayload, options?: { expiresIn?: number }): Promise<string>
  verify<T extends JwtPayload = JwtPayload>(token: string): Promise<{ valid: boolean; payload?: T; reason?: string }>
}

export function jwt(options: JwtOptions): (app: Nelysia) => Nelysia {
  if (typeof options.secret !== "string" || options.secret.length === 0) throw new Error("jwt secret must not be empty")
  if (options.expiresIn !== undefined && (!Number.isFinite(options.expiresIn) || options.expiresIn <= 0)) throw new Error("jwt expiresIn must be positive")
  const headerName = (options.headerName ?? "authorization").toLowerCase()
  const keyPromise = importHmacKey(options.secret)

  const pluginInstance: JwtPluginInstance = {
    async sign(payload: JwtPayload, signOptions?: { expiresIn?: number }): Promise<string> {
      const key = await keyPromise
      return signJwt(payload, key, { expiresIn: signOptions?.expiresIn ?? options.expiresIn })
    },
    async verify<T extends JwtPayload = JwtPayload>(token: string) {
      const key = await keyPromise
      return verifyJwt<T>(token, key)
    }
  }

  return (app: Nelysia) => {
    // Attach jwt instance to app
    ;(app as unknown as Record<string, unknown>)[options.name ?? "jwt"] = pluginInstance

    // Register before-hook specifically for routes declared with auth: "jwt" or auth: true
    const authHook = async (context: Context): Promise<ResponseData | void> => {
      const authHeader = context.headers.get(headerName)
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return context.response(401, {
          error: "Unauthorized",
          message: "Missing or invalid authorization header"
        })
      }

      const token = authHeader.slice(7).trim()
      const key = await keyPromise
      const verification = await verifyJwt(token, key)

      if (!verification.valid) {
        const message = verification.reason === "expired" ? "Token expired" : "Invalid token"
        return context.response(401, {
          error: "Unauthorized",
          message
        })
      }

      context.auth = verification.payload
    }

    // Bind authHook to any current and future route that specifies auth: "jwt" or auth: true
    const originalRoute = app.route.bind(app)
    app.route = (method, path, handler, routeOptions = {}) => {
      const authSetting = routeOptions.auth
      const requiresJwt = authSetting === "jwt" || authSetting === true || (typeof authSetting === "object" && authSetting !== null)
      if (requiresJwt) {
        const wrappedHandler = async (c: Context) => {
          const early = await authHook(c)
          if (early) return early
          return handler(c)
        }
        return originalRoute(method, path, wrappedHandler, routeOptions)
      }
      return originalRoute(method, path, handler, routeOptions)
    }

    return app
  }
}
