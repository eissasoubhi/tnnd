import { hashSessionToken } from "./auth.js";
import { authenticateSession } from "./auth-service.js";
import { routePersonalMemoryRequest, type PersonalMemoryHttpRouteResult } from "./personal-memory-http-router.js";

export type AuthenticatedPersonalMemoryRequest = {
  authorization?: string;
  method: string;
  pathname: string;
  body?: Record<string, unknown>;
};

export type AuthenticatedPersonalMemoryRouteResult =
  | { matched: false }
  | { matched: true; status: number; body: unknown };

function bearerToken(authorization?: string): string {
  if (!authorization?.startsWith("Bearer ")) return "";
  return authorization.slice(7).trim();
}

export async function routeAuthenticatedPersonalMemoryRequest(
  request: AuthenticatedPersonalMemoryRequest
): Promise<AuthenticatedPersonalMemoryRouteResult> {
  if (!request.pathname.startsWith("/api/v1/personal-memories")) return { matched: false };

  const token = bearerToken(request.authorization);
  if (!token) return { matched: true, status: 401, body: { error: "invalid_or_expired_session" } };

  const session = await authenticateSession(await hashSessionToken(token));
  if (!session) return { matched: true, status: 401, body: { error: "invalid_or_expired_session" } };

  const routed: PersonalMemoryHttpRouteResult = await routePersonalMemoryRequest(session.user.id, {
    method: request.method,
    pathname: request.pathname,
    body: request.body
  });
  if (!routed.matched) return { matched: false };
  return { matched: true, status: routed.result.status, body: routed.result.body };
}
