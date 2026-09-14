export type ConversationSyncHealthState = "never-synced" | "synced";

export interface ConversationSyncHealth {
  state: ConversationSyncHealthState;
  lastSyncedAt?: string;
}

export function buildConversationSyncHealth(syncCursorUpdatedAt: Date | null): ConversationSyncHealth {
  if (!syncCursorUpdatedAt) return { state: "never-synced" };
  return {
    state: "synced",
    lastSyncedAt: syncCursorUpdatedAt.toISOString(),
  };
}
