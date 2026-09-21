import type { IncomingMessage } from "node:http";
import { hashSessionToken } from "./auth.js";
import { authenticateSession } from "./auth-service.js";
import { handleGetAiProviderSettingsRequest, handleSaveAiProviderSettingsRequest } from "./ai-provider-settings-controller.js";

export interface AiProviderSettingsRouteResult {
  status: number;
  body: unknown;
}

export type AiProviderSettingsRouteAuthenticator = (tokenHash: string) => ReturnType<typeof authenticateSession>;

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function handleAiProviderSettingsRoute(
  request: IncomingMessage,
  pathname: string,
  body: Record<string, unknown>,
  authenticate: AiProviderSettingsRouteAuthenticator = authenticateSession
): Promise<AiProviderSettingsRouteResult | null> {
  if (pathname !== "/api/v1/ai/provider-settings" || (request.method !== "GET" && request.method !== "PUT")) return null;

  const token = bearerToken(request);
  if (!token) return { status: 401, body: { error: "invalid_or_expired_session" } };

  const session = await authenticate(await hashSessionToken(token));
  if (!session) return { status: 401, body: { error: "invalid_or_expired_session" } };

  if (request.method === "GET") return handleGetAiProviderSettingsRequest(session.user.id);
  return handleSaveAiProviderSettingsRequest(session.user.id, body);
}
