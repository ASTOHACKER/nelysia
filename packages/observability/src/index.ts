import type { Telemetry, TelemetrySpan } from "../../core/src/types.ts"

export interface OtlpHttpExporterOptions {
  url: string
  headers?: Record<string, string>
  fetch?: typeof globalThis.fetch
  serviceName?: string
}

export function otlpHttpExporter(options: OtlpHttpExporterOptions): Pick<Telemetry, "exportSpan"> {
  const request = options.fetch ?? globalThis.fetch
  const serviceName = options.serviceName ?? "nelysia"
  return {
    async exportSpan(span: TelemetrySpan): Promise<void> {
      const response = await request(options.url, {
        method: "POST",
        headers: { "content-type": "application/json", ...options.headers },
        body: JSON.stringify(toOtlpPayload(span, serviceName))
      })
      if (!response.ok) throw new Error(`OTLP exporter returned HTTP ${response.status}`)
    }
  }
}

function toOtlpPayload(span: TelemetrySpan, serviceName: string) {
  const start = BigInt(Math.round((Date.now() - span.durationMs) * 1_000_000))
  const end = BigInt(Date.now() * 1_000_000)
  return {
    resourceSpans: [{
      resource: { attributes: [{ key: "service.name", value: { stringValue: serviceName } }] },
      scopeSpans: [{ spans: [{
        name: span.name,
        startTimeUnixNano: start.toString(),
        endTimeUnixNano: end.toString(),
        attributes: [
          { key: "http.request.id", value: { stringValue: span.requestId } },
          { key: "http.request.method", value: { stringValue: span.method } },
          { key: "http.route", value: { stringValue: span.route } },
          { key: "http.response.status_code", value: { intValue: span.status } }
        ],
        status: span.error ? { code: 2, message: String(span.error) } : { code: 1 }
      }] }]
    }]
  }
}
