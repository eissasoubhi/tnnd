import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import config from "../vite.config";

const directory = dirname(fileURLToPath(import.meta.url));
const compose = readFileSync(resolve(directory, "../../../docker-compose.yml"), "utf8");

test("the TNND dev server proxies authenticated /api calls to the backend", () => {
  assert.equal(typeof config, "object");
  if (!config || !("server" in config)) throw new Error("Vite server config missing");
  const entry = config.server?.proxy?.["/api"];
  assert.ok(entry && typeof entry !== "string", "The /api proxy must be configured");
  assert.equal(entry.changeOrigin, true);
  assert.ok(typeof entry.target === "string" && entry.target.startsWith("http://"));
});

test("the Docker Web UI uses the same-origin path and the Docker API hostname", () => {
  const web = compose.split("  web:\n")[1]?.split("\n  extension:")[0];
  assert.ok(web, "Docker web service is missing");
  assert.match(web, /VITE_TNND_API_BASE_URL:\s*\//);
  assert.match(web, /TNND_DEV_API_PROXY_TARGET:\s*http:\/\/api:4000/);
});

test("the conversation HTTP PATCH operation uses the same API path", () => {
  const client = readFileSync(resolve(directory, "conversation-client.ts"), "utf8");
  assert.match(client, /method: "PATCH"/);
  assert.match(client, /\`\$\{apiBase\}\/api\/v1\/conversations\/\$\{encodeURIComponent\(conversationId\)\}\`/);
});
