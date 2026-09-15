import {
  handlePersonalMemoryApproveRequest,
  handlePersonalMemoryCreateRequest,
  handlePersonalMemoryDeleteRequest,
  handlePersonalMemoryGetRequest,
  handlePersonalMemoryListRequest,
  handlePersonalMemoryUpdateRequest,
  handlePersonalMemoryUsageRequest,
  type PersonalMemoryControllerResult
} from "./personal-memory-controller.js";

export type PersonalMemoryHttpRequest = {
  method: string;
  pathname: string;
  body?: Record<string, unknown>;
};

export type PersonalMemoryHttpRouteResult =
  | { matched: false }
  | { matched: true; result: PersonalMemoryControllerResult };

const prefix = "/api/v1/personal-memories";

function decodeId(pathname: string, suffix = ""): string | null {
  const itemPrefix = `${prefix}/`;
  if (!pathname.startsWith(itemPrefix) || (suffix && !pathname.endsWith(suffix))) return null;
  const end = suffix ? pathname.length - suffix.length : pathname.length;
  const encoded = pathname.slice(itemPrefix.length, end);
  if (!encoded || encoded.includes("/")) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export async function routePersonalMemoryRequest(
  userId: string,
  request: PersonalMemoryHttpRequest
): Promise<PersonalMemoryHttpRouteResult> {
  const { method, pathname, body = {} } = request;

  if (pathname === prefix && method === "GET") {
    return { matched: true, result: await handlePersonalMemoryListRequest(userId) };
  }
  if (pathname === prefix && method === "POST") {
    return { matched: true, result: await handlePersonalMemoryCreateRequest(userId, body) };
  }
  if (pathname === `${prefix}/usage` && method === "POST") {
    return { matched: true, result: await handlePersonalMemoryUsageRequest(userId, body) };
  }

  const approveId = decodeId(pathname, "/approve");
  if (approveId && method === "POST") {
    return { matched: true, result: await handlePersonalMemoryApproveRequest(userId, approveId) };
  }

  const id = decodeId(pathname);
  if (id && method === "GET") {
    return { matched: true, result: await handlePersonalMemoryGetRequest(userId, id) };
  }
  if (id && (method === "PUT" || method === "PATCH")) {
    return { matched: true, result: await handlePersonalMemoryUpdateRequest(userId, id, body) };
  }
  if (id && method === "DELETE") {
    return { matched: true, result: await handlePersonalMemoryDeleteRequest(userId, id) };
  }

  return { matched: false };
}
