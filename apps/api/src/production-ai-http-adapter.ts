import type { IncomingMessage } from "node:http";
import { handleProductionAiRequest, type ProductionAiRouteResult } from "./production-ai-route.js";

export type ReadJsonBody = (request: IncomingMessage) => Promise<Record<string, unknown>>;

const aiSettingsPath = "/api/v1/ai/provider-settings";
const aiConnectionTestPath = "/api/v1/ai/test-connection";
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
  if (![aiSettingsPath, aiConnectionTestPath, textingStyleAnalyzePath, textingStyleSourcesPath].includes(pathname)) return null;

  const needsBody = (request.method === "PUT" && pathname === aiSettingsPath)
    || (request.method === "POST" && pathname === textingStyleAnalyzePath);
  const body = needsBody ? await readJsonBody(request) : {};

  return handleProductionAiRequest(request, pathname, body);
}
