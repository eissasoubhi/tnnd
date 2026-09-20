import type { IncomingMessage } from "node:http";
import { hashSessionToken } from "./auth.js";
import { authenticateSession } from "./auth-service.js";
import { testGeminiConnection } from "./gemini-connection-test.js";

export interface GeminiConnectionTestRouteResult {
  status: number;
  body: unknown;
}

export type GeminiConnectionTestRouteAuthenticator = (tokenHash: string) => ReturnType<typeof authenticateSession>;
export type GeminiConnectionTester = typeof testGeminiConnection;

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function handleGeminiConnectionTestRoute(
  request: IncomingMessage,
  pathname: string,
  authenticate: GeminiConnectionTestRouteAuthenticator = authenticateSession,
  testConnection: GeminiConnectionTester = testGeminiConnection
): Promise<GeminiConnectionTestRouteResult | null> {
  if (pathname !== "/api/v1/ai/test-connection" || request.method !== "POST") return null;

  const token = bearerToken(request);
  if (!token) return { status: 401, body: { error: "invalid_or_expired_session" } };

  const session = await authenticate(await hashSessionToken(token));
  if (!session) return { status: 401, body: { error: "invalid_or_expired_session" } };

  try {
    return { status: 200, body: await testConnection(session.user.id) };
  } catch (error) {
    const code = error instanceof Error ? error.message : "gemini_connection_failed";
    const status = code === "ai_provider_not_configured" ? 409 : code === "gemini_credentials_rejected" ? 422 : 502;
    return { status, body: { error: code } };
  }
}
