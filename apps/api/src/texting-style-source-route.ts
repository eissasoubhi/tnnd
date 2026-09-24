import type { IncomingMessage } from "node:http";
import { hashSessionToken } from "./auth.js";
import { authenticateSession } from "./auth-service.js";
import { handleTextingStyleAnalysisRequest } from "./texting-style-analysis-controller.js";
import { deleteRetainedTextingStyleSourceExamples, getRetainedTextingStyleSourceExamples } from "./texting-style-source-examples-service.js";

export interface TextingStyleSourceRouteResult {
  status: number;
  body: Record<string, unknown>;
}

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function handleTextingStyleSourceRoute(
  request: IncomingMessage,
  pathname: string,
  body: Record<string, unknown> = {}
): Promise<TextingStyleSourceRouteResult | null> {
  const isAnalyze = pathname === "/api/v1/profile/texting-style/analyze" && request.method === "POST";
  const isSources = pathname === "/api/v1/profile/texting-style/source-examples" && (request.method === "GET" || request.method === "DELETE");
  if (!isAnalyze && !isSources) return null;

  const token = bearerToken(request);
  if (!token) return { status: 401, body: { error: "invalid_or_expired_session" } };
  const session = await authenticateSession(await hashSessionToken(token));
  if (!session) return { status: 401, body: { error: "invalid_or_expired_session" } };

  if (isAnalyze) return handleTextingStyleAnalysisRequest(session.user.id, body);

  if (request.method === "GET") {
    const retained = await getRetainedTextingStyleSourceExamples(session.user.id);
    return retained
      ? { status: 200, body: { sourceExamples: retained.examples, updatedAt: retained.updatedAt } }
      : { status: 404, body: { error: "texting_style_source_examples_not_found" } };
  }

  const deleted = await deleteRetainedTextingStyleSourceExamples(session.user.id);
  return { status: 200, body: { deleted } };
}
