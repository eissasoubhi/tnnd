export interface AiProviderSettingsInput {
  apiKey: string;
  model: string;
}

export interface AiProviderSettingsResult {
  provider: "gemini";
  model: string;
  configured: true;
}

export interface AiConnectionTestResult {
  provider: "gemini";
  model: string;
  connected: boolean;
}

export interface AiProviderClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class AiProviderApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
    this.name = "AiProviderApiError";
  }
}

export function createAiProviderClient(token: string, options: AiProviderClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        ...init.headers
      }
    });

    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const code = typeof body.error === "string" ? body.error : "ai_provider_request_failed";
      throw new AiProviderApiError(response.status, code);
    }
    return body as T;
  }

  return {
    saveSettings(input: AiProviderSettingsInput): Promise<AiProviderSettingsResult> {
      return request("/api/v1/ai/provider-settings", {
        method: "PUT",
        body: JSON.stringify(input)
      });
    },

    testConnection(): Promise<AiConnectionTestResult> {
      return request("/api/v1/ai/test-connection", { method: "POST" });
    }
  };
}
