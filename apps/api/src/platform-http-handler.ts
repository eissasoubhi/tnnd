import { dispatchPlatformRoute } from "./platform-route-dispatcher.js";
import type { AnalyticsRouteAuthenticator } from "./analytics-route.js";

export type PlatformJsonSender = (status: number, body: unknown) => void;

/**
 * Bridges Node's HTTP server router to the isolated platform dispatcher.
 * Returns true only when a platform route handled the request so main.ts can
 * delegate metadata and analytics without duplicating their route contracts.
 */
export async function handlePlatformHttpRoute(
  method: string | undefined,
  pathname: string,
  authenticate: AnalyticsRouteAuthenticator,
  sendJson: PlatformJsonSender
): Promise<boolean> {
  const result = await dispatchPlatformRoute(method, pathname, { authenticate });
  if (!result) return false;

  sendJson(result.status, result.body);
  return true;
}
