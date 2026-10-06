import type { IncomingMessage } from "node:http";
import { handleAiProviderSettingsRoute, type AiProviderSettingsRouteResult } from "./ai-provider-settings-route.js";
import { handleGeminiConnectionTestRoute, type GeminiConnectionTestRouteResult } from "./gemini-connection-test-route.js";
import { handleExtensionSuggestionsRoute, type ExtensionSuggestionsRouteResult } from "./extension-suggestions-route.js";
import { handleTextingStyleSourceRoute, type TextingStyleSourceRouteResult } from "./texting-style-source-route.js";

export type ProductionAiRouteResult = AiProviderSettingsRouteResult | GeminiConnectionTestRouteResult | ExtensionSuggestionsRouteResult | TextingStyleSourceRouteResult;

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
  const textingStyleResult = await handleTextingStyleSourceRoute(request, pathname, body);
  if (textingStyleResult) return textingStyleResult;

  const settingsResult = await handleAiProviderSettingsRoute(request, pathname, body);
  if (settingsResult) return settingsResult;

  const suggestionsResult = await handleExtensionSuggestionsRoute(request, pathname, body);
  if (suggestionsResult) return suggestionsResult;

  return handleGeminiConnectionTestRoute(request, pathname);
}
