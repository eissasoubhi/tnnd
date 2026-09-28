import type { IncomingMessage } from "node:http";
import { hashSessionToken } from "./auth.js";
import { authenticateSession } from "./auth-service.js";
import {
  buildAccountDataExport,
  type AccountDataExport
} from "./account-data-export-service.js";

export interface AccountDataExportRouteResult {
  status: number;
  body: unknown;
}

export type AccountDataExportAuthenticator = (
  tokenHash: string
) => Promise<{ user: { id: string } } | null>;

export type AccountDataExportBuilder = (
  userId: string
) => Promise<AccountDataExport | null>;

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export async function handleAccountDataExportRoute(
  request: IncomingMessage,
  pathname: string,
  authenticate: AccountDataExportAuthenticator = async (tokenHash) => authenticateSession(tokenHash),
  buildExport: AccountDataExportBuilder = buildAccountDataExport
): Promise<AccountDataExportRouteResult | null> {
  if (request.method !== "GET" || pathname !== "/api/v1/account/export") return null;

  const token = bearerToken(request);
  if (!token) return { status: 401, body: { error: "invalid_or_expired_session" } };

  const session = await authenticate(await hashSessionToken(token));
  if (!session) return { status: 401, body: { error: "invalid_or_expired_session" } };

  const exported = await buildExport(session.user.id);
  if (!exported) return { status: 404, body: { error: "account_not_found" } };

  return { status: 200, body: { export: exported } };
}
