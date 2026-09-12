import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { hashSessionToken } from "./auth.js";
import { authenticateSession, loginWithPassword, registerAccount, revokeSession } from "./auth-service.js";
import { getPool } from "./db-client.js";
import { profileSchemaVersion, publicProfileSchema, validateProfileEnvelope } from "./profile-schema.js";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "127.0.0.1";
const maxBodyBytes = 32 * 1024;

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "cross-origin-resource-policy": "same-site"
  });
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

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

async function authenticatedUser(request: IncomingMessage) {
  const token = bearerToken(request);
  if (!token) return null;
  return authenticateSession(await hashSessionToken(token));
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
        capabilities: ["health", "profile-schema", "account-registration", "password-login", "session-auth", "session-revocation", "account-profile", "extension-sync-foundation", "security-baseline"]
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/v1/profile/schema") {
      sendJson(response, 200, publicProfileSchema());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/auth/register") {
      const body = await readJsonBody(request);
      const email = typeof body.email === "string" ? body.email : "";
      const password = typeof body.password === "string" ? body.password : "";
      const registration = await registerAccount(email, password);
      if (!registration.ok) {
        const status = registration.error === "email_already_exists" ? 409 : 400;
        sendJson(response, status, { error: registration.error, ...(registration.details ? { details: registration.details } : {}) });
        return;
      }
      sendJson(response, 201, registration);
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

    if (request.method === "GET" && url.pathname === "/api/v1/auth/session") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }
      sendJson(response, 200, session);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/v1/auth/logout") {
      const token = bearerToken(request);
      if (!token) {
        sendJson(response, 401, { error: "missing_bearer_token" });
        return;
      }
      const revoked = await revokeSession(await hashSessionToken(token));
      sendJson(response, revoked ? 200 : 404, revoked ? { ok: true } : { error: "session_not_found" });
      return;
    }

    if ((request.method === "GET" || request.method === "PUT") && url.pathname === "/api/v1/profile") {
      const session = await authenticatedUser(request);
      if (!session) {
        sendJson(response, 401, { error: "invalid_or_expired_session" });
        return;
      }

      if (request.method === "GET") {
        const result = await getPool().query<{ profile_json: unknown; updated_at: Date }>(
          "SELECT profile_json, updated_at FROM user_profiles WHERE user_id = $1 LIMIT 1",
          [session.user.id]
        );
        const row = result.rows[0];
        if (!row) {
          sendJson(response, 404, { error: "profile_not_found" });
          return;
        }
        sendJson(response, 200, { profile: row.profile_json, updatedAt: row.updated_at.toISOString() });
        return;
      }

      const body = await readJsonBody(request);
      const candidate = body.profile ?? body;
      const validated = validateProfileEnvelope(candidate);
      if (!validated.ok) {
        sendJson(response, 400, { error: "invalid_profile", details: validated.errors });
        return;
      }
      const result = await getPool().query<{ updated_at: Date }>(
        `INSERT INTO user_profiles (user_id, schema_version, profile_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (user_id) DO UPDATE SET
           schema_version = EXCLUDED.schema_version,
           profile_json = EXCLUDED.profile_json,
           updated_at = now()
         RETURNING updated_at`,
        [session.user.id, profileSchemaVersion, JSON.stringify(validated.profile)]
      );
      sendJson(response, 200, { profile: validated.profile, updatedAt: result.rows[0]?.updated_at.toISOString() ?? new Date().toISOString() });
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
