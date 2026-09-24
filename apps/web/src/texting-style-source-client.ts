const defaultApiBase = (import.meta.env?.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

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

async function errorFrom(response: Response, fallback: string): Promise<TextingStyleSourceApiError> {
  const payload: unknown = await response.json().catch(() => null);
  const error = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as { error?: unknown }).error
    : null;
  return new TextingStyleSourceApiError(typeof error === "string" && error ? error : fallback, response.status);
}

export function createTextingStyleSourceClient(sessionToken: string, options: { baseUrl?: string; fetchImpl?: typeof fetch } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const endpoint = `${(options.baseUrl ?? defaultApiBase).replace(/\/$/, "")}/api/v1/profile/texting-style/source-examples`;
  const headers = { authorization: `Bearer ${sessionToken}` };
  return {
    async get(): Promise<RetainedTextingStyleSourceExamples | null> {
      const response = await fetchImpl(endpoint, { headers });
      if (response.status === 404) return null;
      if (!response.ok) throw await errorFrom(response, "texting_style_source_examples_fetch_failed");
      const payload = await response.json() as Partial<RetainedTextingStyleSourceExamples>;
      if (typeof payload.sourceExamples !== "string" || typeof payload.updatedAt !== "string") {
        throw new TextingStyleSourceApiError("invalid_texting_style_source_examples_response", 502);
      }
      return { sourceExamples: payload.sourceExamples, updatedAt: payload.updatedAt };
    },
    async delete(): Promise<boolean> {
      const response = await fetchImpl(endpoint, { method: "DELETE", headers });
      if (!response.ok) throw await errorFrom(response, "texting_style_source_examples_delete_failed");
      const payload = await response.json() as { deleted?: unknown };
      return payload.deleted === true;
    }
  };
}

async function authenticatedClient() {
  const { readSession } = await import("./auth-client");
  const session = readSession();
  if (!session) throw new TextingStyleSourceApiError("authentication_required", 401);
  return createTextingStyleSourceClient(session.token);
}

export const fetchRetainedTextingStyleSourceExamples = async () => (await authenticatedClient()).get();
export const deleteRetainedTextingStyleSourceExamples = async () => (await authenticatedClient()).delete();
