import type { IncomingMessage } from "node:http";
import { handleAiProviderSettingsRoute, type AiProviderSettingsRouteResult } from "./ai-provider-settings-route.js";
import { handleGeminiConnectionTestRoute, type GeminiConnectionTestRouteResult } from "./gemini-connection-test-route.js";

export type ProductionAiRouteResult = AiProviderSettingsRouteResult | GeminiConnectionTestRouteResult;

/**
 * Single production entry point for authenticated AI configuration routes.
 * Keeping dispatch here lets main.ts wire the AI surface with one call while
 * preserving the independently tested authentication and secret-handling
 * boundaries of each route.
 */
export async function handleProductionAiRequest(
  request: IncomingMessage,
  pathname: string,
  body: Record<string, unknown> = {}
): Promise<ProductionAiRouteResult | null> {
  const settingsResult = await handleAiProviderSettingsRoute(request, pathname, body);
  if (settingsResult) return settingsResult;

  return handleGeminiConnectionTestRoute(request, pathname);
}
