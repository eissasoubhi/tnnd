export interface AccountPrivacyClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class AccountPrivacyApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super(code);
    this.name = "AccountPrivacyApiError";
  }
}

export function createAccountPrivacyClient(token: string, options: AccountPrivacyClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? "").replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...init.headers
      }
    });

    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const code = typeof body.error === "string" ? body.error : "account_privacy_request_failed";
      throw new AccountPrivacyApiError(response.status, code);
    }
    return body as T;
  }

  return {
    async exportAccountData(): Promise<unknown> {
      const payload = await request<{ export: unknown }>("/api/v1/account/export", { method: "GET" });
      return payload.export;
    },

    async deleteAccount(password: string): Promise<void> {
      await request<{ deleted: true }>("/api/v1/account", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
    }
  };
}
