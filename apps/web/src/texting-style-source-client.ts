import { readSession } from "./auth-client";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";
const endpoint = `${apiBase}/api/v1/profile/texting-style/source-examples`;

export interface RetainedTextingStyleSourceExamples {
  sourceExamples: string;
  updatedAt: string;
}

export class TextingStyleSourceApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "TextingStyleSourceApiError";
  }
}

function token(): string {
  const session = readSession();
  if (!session) throw new TextingStyleSourceApiError("authentication_required", 401);
  return session.token;
}

async function errorFrom(response: Response, fallback: string): Promise<TextingStyleSourceApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const error = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { error?: unknown }).error
    : null;
  return new TextingStyleSourceApiError(typeof error === "string" && error ? error : fallback, response.status);
}

export async function fetchRetainedTextingStyleSourceExamples(): Promise<RetainedTextingStyleSourceExamples | null> {
  const response = await fetch(endpoint, { headers: { authorization: `Bearer ${token()}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw await errorFrom(response, "texting_style_source_examples_fetch_failed");
  const payload = await response.json() as Partial<RetainedTextingStyleSourceExamples>;
  if (typeof payload.sourceExamples !== "string" || typeof payload.updatedAt !== "string") {
    throw new TextingStyleSourceApiError("invalid_texting_style_source_examples_response", 502);
  }
  return { sourceExamples: payload.sourceExamples, updatedAt: payload.updatedAt };
}

export async function deleteRetainedTextingStyleSourceExamples(): Promise<boolean> {
  const response = await fetch(endpoint, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token()}` }
  });
  if (!response.ok) throw await errorFrom(response, "texting_style_source_examples_delete_failed");
  const payload = await response.json() as { deleted?: unknown };
  return payload.deleted === true;
}
