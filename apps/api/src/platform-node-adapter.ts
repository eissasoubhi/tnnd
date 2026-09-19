import type { IncomingMessage, ServerResponse } from "node:http";
import { handlePlatformHttpRoute } from "./platform-http-handler.js";
import type { AnalyticsSnapshotLoader } from "./analytics-controller.js";
import type { AnalyticsRouteAuthenticator } from "./analytics-route.js";

export type NodePlatformJsonSender = (response: ServerResponse, status: number, body: unknown) => void;

/**
 * Adapts the Node HTTP request/response pair to the isolated platform router.
 * Authentication remains injectable so the production server can reuse its
 * existing session authentication without duplicating platform route logic.
 */
export async function handleNodePlatformRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  authenticate: AnalyticsRouteAuthenticator,
  sendJson: NodePlatformJsonSender,
  loadAnalyticsSnapshot?: AnalyticsSnapshotLoader
): Promise<boolean> {
  return handlePlatformHttpRoute(
    request.method,
    pathname,
    authenticate,
    (status, body) => sendJson(response, status, body),
    loadAnalyticsSnapshot
  );
}
