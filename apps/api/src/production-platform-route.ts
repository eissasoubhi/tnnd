import type { IncomingMessage, ServerResponse } from "node:http";
import { hashSessionToken } from "./auth.js";
import { authenticateSession } from "./auth-service.js";
import { handleNodePlatformRequest, type NodePlatformJsonSender } from "./platform-node-adapter.js";

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

/**
 * Production wiring for platform-level routes. It deliberately reuses the
 * server's persisted session authentication while keeping main.ts responsible
 * only for ordering this router before legacy endpoint handling.
 */
export async function handleProductionPlatformRequest(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  sendJson: NodePlatformJsonSender
): Promise<boolean> {
  return handleNodePlatformRequest(
    request,
    response,
    pathname,
    async () => {
      const token = bearerToken(request);
      if (!token) return null;
      const session = await authenticateSession(await hashSessionToken(token));
      return session ? { user: { id: session.user.id } } : null;
    },
    sendJson
  );
}
