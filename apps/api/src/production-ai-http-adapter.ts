import type { IncomingMessage } from "node:http";
import { handleProductionAiRequest, type ProductionAiRouteResult } from "./production-ai-route.js";

export type ReadJsonBody = (request: IncomingMessage) => Promise<Record<string, unknown>>;

const aiSettingsPath = "/api/v1/ai/provider-settings";
const aiConnectionTestPath = "/api/v1/ai/test-connection";
const aiSuggestionsPath = "/api/v1/ai/suggestions";
const identityBuilderPath = "/api/v1/profile/identity-builder";
const identityAnalyzePath = "/api/v1/profile/identity-builder/analyze";
const identityApprovePath = "/api/v1/profile/identity-builder/approve";
const textingStyleAnalyzePath = "/api/v1/profile/texting-style/analyze";
const textingStyleSourcesPath = "/api/v1/profile/texting-style/source-examples";

/**
 * HTTP-facing adapter for the production AI surface.
 * Request bodies are consumed only by write routes that explicitly need them.
 */
export async function handleProductionAiHttpRequest(
  request: IncomingMessage,
  pathname: string,
  readJsonBody: ReadJsonBody
): Promise<ProductionAiRouteResult | null> {
  if (![aiSettingsPath, aiConnectionTestPath, aiSuggestionsPath, identityBuilderPath, identityAnalyzePath, identityApprovePath, textingStyleAnalyzePath, textingStyleSourcesPath].includes(pathname)) return null;

  const needsBody = (request.method === "PUT" && pathname === aiSettingsPath)
    || (request.method === "POST" && pathname === aiSuggestionsPath)
    || (request.method === "POST" && (pathname === identityAnalyzePath || pathname === identityApprovePath))
    || (request.method === "POST" && pathname === textingStyleAnalyzePath);
  const body = needsBody ? await readJsonBody(request) : {};

  return handleProductionAiRequest(request, pathname, body);
}
