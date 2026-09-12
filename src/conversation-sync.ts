import { getBackendSession, saveSyncState } from "./storage";

const API_BASE = "http://127.0.0.1:4000";

export type ConversationStatus =
  | "active"
  | "paused"
  | "disabled"
  | "waiting-for-them"
  | "waiting-for-user"
  | "action-required"
  | "moved-off-tinder"
  | "stale"
  | "archived";

export interface ConversationMessageDelta {
  externalMessageId: string;
  direction: "incoming" | "outgoing";
  text: string;
  sentAt: string;
}

export interface ConversationSyncInput {
  externalThreadId: string;
  knownConversationId?: string;
  cursor?: string;
  status?: ConversationStatus;
  messages: ConversationMessageDelta[];
}

export interface ConversationSyncResult {
  conversationId: string;
  status: ConversationStatus;
  acceptedMessageIds: string[];
  nextCursor: string;
  serverTime: string;
}

const threadRefsKey = "tnnd.conversationRefs";

type ThreadRefs = Record<string, { conversationId: string; cursor: string }>;

async function loadThreadRefs(): Promise<ThreadRefs> {
  const stored = await chrome.storage.local.get(threadRefsKey);
  const value = stored[threadRefsKey];
  return value && typeof value === "object" ? value as ThreadRefs : {};
}

export function inferConversationStatus(messages: ConversationMessageDelta[]): ConversationStatus | undefined {
  if (!messages.length) return undefined;
  const latest = [...messages].sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt)).at(-1);
  if (!latest) return undefined;
  return latest.direction === "incoming" ? "waiting-for-user" : "waiting-for-them";
}

export async function getConversationRef(externalThreadId: string): Promise<{ conversationId: string; cursor: string } | null> {
  const refs = await loadThreadRefs();
  return refs[externalThreadId] ?? null;
}

export async function syncConversationDelta(
  externalThreadId: string,
  messages: ConversationMessageDelta[],
  requestedStatus?: ConversationStatus
): Promise<ConversationSyncResult> {
  const session = await getBackendSession();
  if (!session) throw new Error("TNND account is not connected.");
  const refs = await loadThreadRefs();
  const previous = refs[externalThreadId];
  const status = requestedStatus ?? inferConversationStatus(messages);
  await saveSyncState({ status: "syncing", pendingItems: messages.length, lastSyncedAt: null, message: null });

  const response = await fetch(`${API_BASE}/api/v1/conversations/sync`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${session.token}`
    },
    body: JSON.stringify({
      externalThreadId,
      ...(previous?.conversationId ? { knownConversationId: previous.conversationId } : {}),
      ...(previous?.cursor ? { cursor: previous.cursor } : {}),
      ...(status ? { status } : {}),
      messages
    } satisfies ConversationSyncInput)
  });
  const payload = await response.json().catch(() => null) as (ConversationSyncResult & { error?: string }) | null;
  if (!response.ok || !payload?.conversationId || !payload.nextCursor) {
    const message = payload?.error ?? "Conversation sync failed.";
    await saveSyncState({ status: "error", pendingItems: messages.length, lastSyncedAt: null, message });
    throw new Error(message);
  }

  refs[externalThreadId] = { conversationId: payload.conversationId, cursor: payload.nextCursor };
  await chrome.storage.local.set({ [threadRefsKey]: refs });
  await saveSyncState({ status: "connected", pendingItems: 0, lastSyncedAt: payload.serverTime, message: null });
  return payload;
}
