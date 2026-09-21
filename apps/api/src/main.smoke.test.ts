import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import test from "node:test";

async function reservePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForHealth(base: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`main server exited early with code ${child.exitCode}`);
    try {
      const response = await fetch(`${base}/health`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("main server did not become healthy in time");
}

test("main server exposes production AI routes without breaking health", async () => {
  const port = await reservePort();
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: process.cwd(),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => { stderr += String(chunk); });

  try {
    await waitForHealth(base, child);

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { ok?: boolean }).ok, true);

    const testConnection = await fetch(`${base}/api/v1/ai/test-connection`, { method: "POST" });
    assert.equal(testConnection.status, 401);
    assert.deepEqual(await testConnection.json(), { error: "invalid_or_expired_session" });

    const settings = await fetch(`${base}/api/v1/ai/provider-settings`);
    assert.equal(settings.status, 401);
    assert.deepEqual(await settings.json(), { error: "invalid_or_expired_session" });
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", () => resolve());
      setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2_000).unref();
    });
  }

  assert.equal(stderr, "");
});
