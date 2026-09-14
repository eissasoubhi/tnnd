import { getBackendSession } from "./storage";
import { getConversationRef } from "./conversation-sync";
import {
  DEFAULT_TINDER_CONVERSATION_MANAGEMENT,
  normalizeTinderConversationManagement,
  type TinderConversationManagement
} from "./tinder-ai-takeover-policy";
import type { TinderBoundedReadResult } from "./tinder-bounded-read-handlers";
import {
  readAiManagedTinderThreadSyncCandidate,
  shouldSyncAiManagedTinderThreadCandidate,
  type TinderThreadSyncCandidate
} from "./tinder-thread-sync-gate";

const API_BASE = "http://127.0.0.1:4000";

interface ThreadLookupPayload {
  conversation?: {
    id?: unknown;
    externalThreadId?: unknown;
    managementState?: unknown;
    explicitlySelected?: unknown;
    syncCursor?: unknown;
    syncCursorUpdatedAt?: unknown;
  };
  error?: unknown;
}

export interface TinderBackendConversationManagement {
  conversationId: string | null;
  management: TinderConversationManagement;
  syncCursor: string | null;
  syncCursorUpdatedAt: string | null;
}

export type TinderConversationRefReconciliation =
  | "no-local-ref"
  | "backend-unmapped"
  | "matching-ref"
  | "conversation-mismatch";

export type TinderCursorReconciliation =
  | "no-backend-cursor"
  | "local-missing"
  | "matching-cursor"
  | "cursor-mismatch";

export interface TinderBackendSyncDecision extends TinderBackendConversationManagement {
  candidate: TinderThreadSyncCandidate | null;
  shouldSync: boolean;
  reconciliation: TinderConversationRefReconciliation;
  cursorReconciliation: TinderCursorReconciliation;
  effectiveCursor: string | null;
}

function reconcileConversationRef(
  localConversationId: string | null,
  backendConversationId: string | null
): TinderConversationRefReconciliation {
  if (!localConversationId) return "no-local-ref";
  if (!backendConversationId) return "backend-unmapped";
  return localConversationId === backendConversationId ? "matching-ref" : "conversation-mismatch";
}

function reconcileCursor(localCursor: string | null, backendCursor: string | null): TinderCursorReconciliation {
  if (!backendCursor) return "no-backend-cursor";
  if (!localCursor) return "local-missing";
  return localCursor === backendCursor ? "matching-cursor" : "cursor-mismatch";
}

export async function loadTinderConversationManagement(
  externalThreadId: string
): Promise<TinderBackendConversationManagement> {
  const threadId = externalThreadId.trim();
  if (!threadId) {
    return {
      conversationId: null,
      management: { ...DEFAULT_TINDER_CONVERSATION_MANAGEMENT },
      syncCursor: null,
      syncCursorUpdatedAt: null
    };
  }

  const session = await getBackendSession();
  if (!session) {
    return {
      conversationId: null,
      management: { ...DEFAULT_TINDER_CONVERSATION_MANAGEMENT },
      syncCursor: null,
      syncCursorUpdatedAt: null
    };
  }

  const response = await fetch(
    `${API_BASE}/api/v1/conversations/by-external-thread?externalThreadId=${encodeURIComponent(threadId)}`,
    { headers: { authorization: `Bearer ${session.token}` } }
  );

  if (response.status === 404) {
    return {
      conversationId: null,
      management: { ...DEFAULT_TINDER_CONVERSATION_MANAGEMENT },
      syncCursor: null,
      syncCursorUpdatedAt: null
    };
  }

  if (!response.ok) {
    throw new Error(`Conversation management lookup failed (${response.status}).`);
  }

  const payload = await response.json().catch(() => null) as ThreadLookupPayload | null;
  const conversation = payload?.conversation;
  const conversationId = typeof conversation?.id === "string" && conversation.id.trim()
    ? conversation.id.trim()
    : null;

  const management = normalizeTinderConversationManagement({
    state: typeof conversation?.managementState === "string"
      ? conversation.managementState as TinderConversationManagement["state"]
      : undefined,
    explicitlySelected: conversation?.explicitlySelected === true
  });

  const syncCursor = typeof conversation?.syncCursor === "string" && conversation.syncCursor.trim()
    ? conversation.syncCursor.trim()
    : null;
  const syncCursorUpdatedAt = typeof conversation?.syncCursorUpdatedAt === "string" && conversation.syncCursorUpdatedAt.trim()
    ? conversation.syncCursorUpdatedAt.trim()
    : null;

  return { conversationId, management, syncCursor, syncCursorUpdatedAt };
}

export async function resolveTinderBackendSyncDecision(
  externalThreadId: string,
  readResult: TinderBoundedReadResult,
  persistedCursor: string | null
): Promise<TinderBackendSyncDecision> {
  const backend = await loadTinderConversationManagement(externalThreadId);
  const localRef = await getConversationRef(externalThreadId);
  const reconciliation = reconcileConversationRef(localRef?.conversationId ?? null, backend.conversationId);
  const cursorReconciliation = reconcileCursor(persistedCursor, backend.syncCursor);
  const effectiveCursor = cursorReconciliation === "local-missing" ? backend.syncCursor : persistedCursor;
  const candidate = readAiManagedTinderThreadSyncCandidate(readResult, backend.management);
  const identitySafe = reconciliation !== "conversation-mismatch" && reconciliation !== "backend-unmapped";
  const cursorSafe = cursorReconciliation !== "cursor-mismatch";
  const shouldSync = identitySafe && cursorSafe && candidate
    ? shouldSyncAiManagedTinderThreadCandidate(candidate, effectiveCursor, backend.management)
    : false;
  return {
    ...backend,
    candidate,
    shouldSync,
    reconciliation,
    cursorReconciliation,
    effectiveCursor
  };
}
