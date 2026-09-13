import { Nelysia } from "../packages/core/src/index.ts"

// Router scale benchmark: measures single-lookup routing cost as the table grows.
// Usage: ROUTES=100|500|1000 N=100000 node --experimental-strip-types benchmarks/router-scale.ts
const routeCount = Number(process.env.ROUTES ?? 500)
const iterations = Number(process.env.N ?? 100000)

const app = new Nelysia({ requestId: false })
for (let i = 0; i < routeCount; i++) app.get(`/s${i}`, () => "ok")
for (let i = 0; i < routeCount; i++) app.get(`/u${i}/:id`, ({ params }) => params.id)

async function bench(name: string, url: string, n: number): Promise<void> {
  for (let i = 0; i < 1000; i++) await app.handle({ method: "GET", url })
  const started = performance.now()
  for (let i = 0; i < n; i++) await app.handle({ method: "GET", url })
  const elapsed = performance.now() - started
  console.log(`${name}\t${(n / (elapsed / 1000)).toFixed(0)} req/s`)
}

console.log(`routes=${routeCount * 2} (static=${routeCount}, dynamic=${routeCount})`)
await bench(`static-last      /s${routeCount - 1}       `, `/s${routeCount - 1}`, iterations)
await bench(`dynamic-last     /u${routeCount - 1}/42    `, `/u${routeCount - 1}/42`, iterations)
await bench("dynamic-first    /u0/42       ", "/u0/42", iterations)
await bench("miss             /nope        ", "/nope", Math.floor(iterations / 2))
