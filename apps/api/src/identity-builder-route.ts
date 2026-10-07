import type { IncomingMessage } from "node:http";
import { hashSessionToken } from "./auth.js";
import { authenticateSession } from "./auth-service.js";
import { analyzeIdentityOnce, approveIdentity, getIdentityBuilderState } from "./identity-builder-service.js";

export type IdentityBuilderRouteResult = { status: number; body: unknown };

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function handleIdentityBuilderRoute(
  request: IncomingMessage,
  pathname: string,
  body: Record<string, unknown>
): Promise<IdentityBuilderRouteResult | null> {
  if (!pathname.startsWith("/api/v1/profile/identity-builder")) return null;
  const token = bearerToken(request);
  if (!token) return { status: 401, body: { error: "invalid_or_expired_session" } };
  const session = await authenticateSession(await hashSessionToken(token));
  if (!session) return { status: 401, body: { error: "invalid_or_expired_session" } };

  try {
    if (pathname === "/api/v1/profile/identity-builder" && request.method === "GET") {
      return { status: 200, body: { state: await getIdentityBuilderState(session.user.id) } };
    }
    if (pathname === "/api/v1/profile/identity-builder/analyze" && request.method === "POST") {
      const result = await analyzeIdentityOnce(session.user.id, body.sourceText);
      return { status: 200, body: result };
    }
    if (pathname === "/api/v1/profile/identity-builder/approve" && request.method === "POST") {
      return { status: 200, body: { state: await approveIdentity(session.user.id, body.analysis) } };
    }
  } catch (error) {
    const code = error instanceof Error ? error.message : "identity_builder_failed";
    const status = code === "ai_provider_not_configured" ? 409
      : code === "gemini_credentials_rejected" || code === "gemini_model_unavailable" ? 422
      : code.startsWith("gemini_") ? 502
      : code.startsWith("invalid_identity_") ? 400
      : code === "identity_builder_not_analyzed" ? 409
      : 500;
    return { status, body: { error: code } };
  }
  return null;
}
