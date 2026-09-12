import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hashSessionToken } from "./auth.js";
import { loginWithPassword, revokeSession } from "./auth-service.js";
import { publicProfileSchema } from "./profile-schema.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
const maxBodyBytes = 32 * 1024;

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("body_too_large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
  return parsed as Record<string, unknown>;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `${host}:${port}`}`);

  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        service: "tnnd-api",
        version: "0.1.0",
        now: new Date().toISOString()
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/meta") {
      sendJson(response, 200, {
        apiVersion: "v1",
        capabilities: ["health", "profile-schema", "password-login", "session-revocation", "account-foundation", "extension-sync-foundation"]
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/profile/schema") {
      sendJson(response, 200, publicProfileSchema());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/auth/login") {
      const body = await readJsonBody(request);
      const email = typeof body.email === "string" ? body.email : "";
      const password = typeof body.password === "string" ? body.password : "";
      const login = await loginWithPassword(email, password);
      if (!login) {
        sendJson(response, 401, { error: "invalid_credentials" });
        return;
      }
      sendJson(response, 200, login);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
      const authorization = request.headers.authorization ?? "";
      const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
      if (!token) {
        sendJson(response, 401, { error: "missing_bearer_token" });
        return;
      }
      const revoked = await revokeSession(await hashSessionToken(token));
      sendJson(response, revoked ? 200 : 404, revoked ? { ok: true } : { error: "session_not_found" });
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "internal_error";
    if (message === "body_too_large") {
      sendJson(response, 413, { error: message });
      return;
    }
    if (error instanceof SyntaxError || message === "invalid_json") {
      sendJson(response, 400, { error: "invalid_json" });
      return;
    }
    console.error("TNND API request failed", error);
    sendJson(response, 500, { error: "internal_error" });
  }
});

server.listen(port, host, () => {
  console.log(`TNND API listening on http://${host}:${port}`);
});
