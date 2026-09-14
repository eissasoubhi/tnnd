import type { AuthSession } from "./auth-client";

const apiBase = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export const conversationManagementStates = [
  "unmanaged",
  "ai-managed",
  "manual",
  "moved-off-tinder",
  "archived"
] as const;

export type ConversationManagementState = (typeof conversationManagementStates)[number];
export type ConversationSyncHealthState = "never-synced" | "synced";

export interface ConversationSyncHealth {
  state: ConversationSyncHealthState;
  lastSyncedAt?: string;
}

export interface ConversationManagementRecord {
  conversationId: string;
  externalThreadId: string;
  managementState: ConversationManagementState;
  explicitlySelected: boolean;
  selectedAt?: string;
  syncHealth: ConversationSyncHealth;
  updatedAt: string;
}

export interface ConversationManagementUpdate {
  conversationId: string;
  managementState: ConversationManagementState;
}

export class ConversationManagementApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ConversationManagementApiError";
  }
}

function isManagementState(value: unknown): value is ConversationManagementState {
  return typeof value === "string" && conversationManagementStates.includes(value as ConversationManagementState);
}

function normalizeSyncHealth(value: unknown): ConversationSyncHealth {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { state: "never-synced" };
  const input = value as Record<string, unknown>;
  if (input.state !== "synced") return { state: "never-synced" };
  return {
    state: "synced",
    ...(typeof input.lastSyncedAt === "string" && input.lastSyncedAt ? { lastSyncedAt: input.lastSyncedAt } : {})
  };
}

function normalizeRecord(value: unknown): ConversationManagementRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Conversation management record is invalid.");
  const input = value as Record<string, unknown>;
  if (typeof input.conversationId !== "string" || !input.conversationId.trim()) throw new Error("Conversation management id is missing.");
  if (typeof input.externalThreadId !== "string" || !input.externalThreadId.trim()) throw new Error("Conversation external thread id is missing.");
  if (!isManagementState(input.managementState)) throw new Error("Conversation management state is invalid.");
  if (typeof input.explicitlySelected !== "boolean") throw new Error("Conversation management selection flag is invalid.");
  if (typeof input.updatedAt !== "string" || !input.updatedAt) throw new Error("Conversation management timestamp is missing.");
  return {
    conversationId: input.conversationId,
    externalThreadId: input.externalThreadId,
    managementState: input.managementState,
    explicitlySelected: input.explicitlySelected,
    ...(typeof input.selectedAt === "string" && input.selectedAt ? { selectedAt: input.selectedAt } : {}),
    syncHealth: normalizeSyncHealth(input.syncHealth),
    updatedAt: input.updatedAt
  };
}

async function parseJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null) as Promise<T | null>;
}

export async function listConversationManagement(session: AuthSession): Promise<ConversationManagementRecord[]> {
  const response = await fetch(`${apiBase}/api/v1/conversations/management`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  const payload = await parseJson<{ conversations?: unknown[]; error?: string }>(response);
  if (!response.ok || !payload?.conversations) {
    throw new ConversationManagementApiError(payload?.error ?? "Unable to load conversation management settings.", response.status);
  }
  try {
    return payload.conversations.map(normalizeRecord);
  } catch (error) {
    throw new ConversationManagementApiError(error instanceof Error ? error.message : "Conversation management response is invalid.", response.status);
  }
}

export async function saveConversationManagement(
  session: AuthSession,
  updates: readonly ConversationManagementUpdate[]
): Promise<ConversationManagementRecord[]> {
  if (updates.length < 1 || updates.length > 100) {
    throw new ConversationManagementApiError("Choose between 1 and 100 conversations before saving.", 400);
  }
  const response = await fetch(`${apiBase}/api/v1/conversations/management`, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${session.token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ updates })
  });
  const payload = await parseJson<{ conversations?: unknown[]; error?: string }>(response);
  if (!response.ok || !payload?.conversations) {
    throw new ConversationManagementApiError(payload?.error ?? "Unable to save conversation management settings.", response.status);
  }
  try {
    return payload.conversations.map(normalizeRecord);
  } catch (error) {
    throw new ConversationManagementApiError(error instanceof Error ? error.message : "Conversation management response is invalid.", response.status);
  }
}
