import type { IncomingMessage } from "node:http";
import { handleProductionAiRequest, type ProductionAiRouteResult } from "./production-ai-route.js";

export type ReadJsonBody = (request: IncomingMessage) => Promise<Record<string, unknown>>;

const aiSettingsPath = "/api/v1/ai/provider-settings";
const aiConnectionTestPath = "/api/v1/ai/test-connection";

/**
 * HTTP-facing adapter for the production AI surface.
 * It deliberately reads a request body only for the settings write route so
 * connection tests cannot accidentally consume or depend on request payloads.
 */
export async function handleProductionAiHttpRequest(
  request: IncomingMessage,
  pathname: string,
  readJsonBody: ReadJsonBody
): Promise<ProductionAiRouteResult | null> {
  if (pathname !== aiSettingsPath && pathname !== aiConnectionTestPath) return null;

  const body = request.method === "PUT" && pathname === aiSettingsPath
    ? await readJsonBody(request)
    : {};

  return handleProductionAiRequest(request, pathname, body);
}
