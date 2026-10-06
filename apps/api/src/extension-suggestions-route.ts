import type { IncomingMessage } from "node:http";
import { hashSessionToken } from "./auth.js";
import { authenticateSession } from "./auth-service.js";
import { generateExtensionSuggestions, validateExtensionSuggestionRequest } from "./extension-suggestions.js";

export interface ExtensionSuggestionsRouteResult {
  status: number;
  body: unknown;
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function handleExtensionSuggestionsRoute(
  request: IncomingMessage,
  pathname: string,
  body: Record<string, unknown>
): Promise<ExtensionSuggestionsRouteResult | null> {
  if (pathname !== "/api/v1/ai/suggestions" || request.method !== "POST") return null;

  const token = bearerToken(request);
  if (!token) return { status: 401, body: { error: "invalid_or_expired_session" } };

  const session = await authenticateSession(await hashSessionToken(token));
  if (!session) return { status: 401, body: { error: "invalid_or_expired_session" } };

  let parsed;
  try {
    parsed = validateExtensionSuggestionRequest(body);
  } catch (error) {
    return {
      status: 400,
      body: { error: error instanceof Error ? error.message : "invalid_extension_generation_request" }
    };
  }

  try {
    const result = await generateExtensionSuggestions(session.user.id, parsed);
    return { status: 200, body: result };
  } catch (error) {
    const code = error instanceof Error ? error.message : "extension_generation_failed";
    const status = code === "ai_provider_not_configured"
      ? 409
      : code === "gemini_credentials_rejected"
        ? 422
        : 502;
    return { status, body: { error: code } };
  }
}
