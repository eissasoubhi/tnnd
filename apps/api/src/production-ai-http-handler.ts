import type { IncomingMessage, ServerResponse } from "node:http";
import { handleProductionAiHttpRequest, type ReadJsonBody } from "./production-ai-http-adapter.js";

export type SendJson = (response: ServerResponse, status: number, payload: unknown) => void;

/**
 * Bridges the production AI adapter to Node's HTTP response boundary.
 * Returns true only when an AI route was handled so main.ts can fall through
 * to its existing routes without duplicating AI dispatch logic.
 */
export async function handleProductionAiHttp(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  readJsonBody: ReadJsonBody,
  sendJson: SendJson
): Promise<boolean> {
  const result = await handleProductionAiHttpRequest(request, pathname, readJsonBody);
  if (!result) return false;

  sendJson(response, result.status, result.body);
  return true;
}
