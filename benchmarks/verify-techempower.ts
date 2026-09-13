import { spawn } from "node:child_process"
import assert from "node:assert/strict"

const PORT = 4385

async function main() {
  console.log("=== TECHEMPOWER COMPLIANCE VERIFICATION ===")
  const child = spawn("bun", ["benchmarks/server-techempower.ts"], {
    env: { ...process.env, FRAMEWORK: "nelysia-static", PORT: String(PORT) },
    stdio: ["ignore", "pipe", "inherit"]
  })

  await new Promise<void>((resolve, reject) => {
    child.stdout?.on("data", (d) => {
      if (d.toString().includes("ready:")) resolve()
    })
    child.once("error", reject)
    setTimeout(() => reject(new Error("Timeout starting verification server")), 5000)
  })

  try {
    // 1. Verify /plaintext
    console.log("\n[1] Verifying /plaintext...")
    const plainRes = await fetch(`http://127.0.0.1:${PORT}/plaintext`)
    assert.equal(plainRes.status, 200, "Plaintext status must be 200")

    const plainBytes = new Uint8Array(await plainRes.arrayBuffer())
    const plainText = new TextDecoder().decode(plainBytes)
    assert.equal(plainBytes.byteLength, 13, `Plaintext size must be exactly 13 bytes, got ${plainBytes.byteLength}`)
    assert.equal(plainText, "Hello, World!", `Plaintext body must be 'Hello, World!', got '${plainText}'`)

    const plainType = plainRes.headers.get("content-type")
    assert.ok(plainType?.startsWith("text/plain"), `Content-Type must start with text/plain, got '${plainType}'`)

    const plainServer = plainRes.headers.get("server")
    assert.ok(plainServer, "Server header must be present")

    const plainDate = plainRes.headers.get("date")
    assert.ok(plainDate, "Date header must be present")
    assert.ok(!isNaN(Date.parse(plainDate)), `Date header must be valid RFC 7231, got '${plainDate}'`)

    console.log("  ✓ Status: 200 OK")
    console.log("  ✓ Body: 'Hello, World!' (13 bytes exact)")
    console.log(`  ✓ Content-Type: ${plainType}`)
    console.log(`  ✓ Server: ${plainServer}`)
    console.log(`  ✓ Date: ${plainDate}`)

    // 2. Verify /json
    console.log("\n[2] Verifying /json...")
    const jsonRes = await fetch(`http://127.0.0.1:${PORT}/json`)
    assert.equal(jsonRes.status, 200, "JSON status must be 200")

    const jsonType = jsonRes.headers.get("content-type")
    assert.ok(jsonType?.includes("application/json"), `Content-Type must be application/json, got '${jsonType}'`)

    const jsonBody = (await jsonRes.json()) as { message: string }
    assert.deepEqual(jsonBody, { message: "Hello, World!" }, `JSON payload must match, got ${JSON.stringify(jsonBody)}`)

    const jsonServer = jsonRes.headers.get("server")
    assert.ok(jsonServer, "Server header must be present")

    const jsonDate = jsonRes.headers.get("date")
    assert.ok(jsonDate, "Date header must be present")

    console.log("  ✓ Status: 200 OK")
    console.log(`  ✓ Body: ${JSON.stringify(jsonBody)}`)
    console.log(`  ✓ Content-Type: ${jsonType}`)
    console.log(`  ✓ Server: ${jsonServer}`)
    console.log(`  ✓ Date: ${jsonDate}`)

    console.log("\n>>> ALL TECHEMPOWER COMPLIANCE CHECKS PASSED (100% VALID) <<<\n")
  } finally {
    child.kill("SIGKILL")
  }
}

main().catch((err) => {
  console.error("Compliance check failed:", err)
  process.exit(1)
})
