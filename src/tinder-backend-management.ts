import { getBackendSession, getSyncState, saveSyncState } from "./storage";
import { getConversationRef, type ConversationStatus } from "./conversation-sync";
import { classifySyncReconciliation } from "./sync-status";
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

const conversationStatuses = new Set<ConversationStatus>([
  "active", "paused", "disabled", "waiting-for-them", "waiting-for-user", "action-required", "moved-off-tinder", "stale", "archived"
]);

interface ThreadLookupPayload {
  conversation?: { id?: unknown; externalThreadId?: unknown; status?: unknown; managementState?: unknown; explicitlySelected?: unknown; syncCursor?: unknown; syncCursorUpdatedAt?: unknown; };
  error?: unknown;
}

export interface TinderBackendConversationManagement {
  conversationId: string | null;
  conversationStatus: ConversationStatus | null;
  management: TinderConversationManagement;
  syncCursor: string | null;
  syncCursorUpdatedAt: string | null;
}

export type TinderConversationRefReconciliation = "no-local-ref" | "backend-unmapped" | "matching-ref" | "conversation-mismatch";
export type TinderCursorReconciliation = "no-backend-cursor" | "local-missing" | "matching-cursor" | "cursor-mismatch";

export interface TinderBackendSyncDecision extends TinderBackendConversationManagement {
  candidate: TinderThreadSyncCandidate | null;
  shouldSync: boolean;
  statusAllowsAutomation: boolean;
  reconciliation: TinderConversationRefReconciliation;
  cursorReconciliation: TinderCursorReconciliation;
  effectiveCursor: string | null;
}

function reconcileConversationRef(localConversationId: string | null, backendConversationId: string | null): TinderConversationRefReconciliation {
  if (!localConversationId) return "no-local-ref";
  if (!backendConversationId) return "backend-unmapped";
  return localConversationId === backendConversationId ? "matching-ref" : "conversation-mismatch";
}

function reconcileCursor(localCursor: string | null, backendCursor: string | null): TinderCursorReconciliation {
  if (!backendCursor) return "no-backend-cursor";
  if (!localCursor) return "local-missing";
  return localCursor === backendCursor ? "matching-cursor" : "cursor-mismatch";
}

function normalizeConversationStatus(value: unknown): ConversationStatus | null {
  return typeof value === "string" && conversationStatuses.has(value as ConversationStatus) ? value as ConversationStatus : null;
}

export function conversationStatusAllowsTinderAutomation(status: ConversationStatus | null): boolean {
  return status !== "action-required" && status !== "paused" && status !== "disabled" && status !== "archived" && status !== "moved-off-tinder";
}

export function describeConversationAutomationPause(status: ConversationStatus | null): string | null {
  if (status === "action-required") return "Human action required · Tinder automation paused until the action is resolved in TNND.";
  if (!conversationStatusAllowsTinderAutomation(status)) return `Conversation automation paused by server status: ${status}.`;
  return null;
}

export function reconcileAutomationPauseMessage(currentMessage: string | null, status: ConversationStatus | null): string | null {
  const nextPause = describeConversationAutomationPause(status);
  if (nextPause) return nextPause;
  if (currentMessage?.startsWith("Human action required ·") || currentMessage?.startsWith("Conversation automation paused by server status:")) return null;
  return currentMessage;
}

export async function loadTinderConversationManagement(externalThreadId: string): Promise<TinderBackendConversationManagement> {
  const threadId = externalThreadId.trim();
  if (!threadId) return { conversationId: null, conversationStatus: null, management: { ...DEFAULT_TINDER_CONVERSATION_MANAGEMENT }, syncCursor: null, syncCursorUpdatedAt: null };
  const session = await getBackendSession();
  if (!session) return { conversationId: null, conversationStatus: null, management: { ...DEFAULT_TINDER_CONVERSATION_MANAGEMENT }, syncCursor: null, syncCursorUpdatedAt: null };

  const response = await fetch(`${API_BASE}/api/v1/conversations/by-external-thread?externalThreadId=${encodeURIComponent(threadId)}`, { headers: { authorization: `Bearer ${session.token}` } });
  if (response.status === 404) return { conversationId: null, conversationStatus: null, management: { ...DEFAULT_TINDER_CONVERSATION_MANAGEMENT }, syncCursor: null, syncCursorUpdatedAt: null };
  if (!response.ok) throw new Error(`Conversation management lookup failed (${response.status}).`);

  const payload = await response.json().catch(() => null) as ThreadLookupPayload | null;
  const conversation = payload?.conversation;
  const conversationId = typeof conversation?.id === "string" && conversation.id.trim() ? conversation.id.trim() : null;
  const conversationStatus = normalizeConversationStatus(conversation?.status);
  const management = normalizeTinderConversationManagement({
    state: typeof conversation?.managementState === "string" ? conversation.managementState as TinderConversationManagement["state"] : undefined,
    explicitlySelected: conversation?.explicitlySelected === true
  });
  const syncCursor = typeof conversation?.syncCursor === "string" && conversation.syncCursor.trim() ? conversation.syncCursor.trim() : null;
  const syncCursorUpdatedAt = typeof conversation?.syncCursorUpdatedAt === "string" && conversation.syncCursorUpdatedAt.trim() ? conversation.syncCursorUpdatedAt.trim() : null;
  return { conversationId, conversationStatus, management, syncCursor, syncCursorUpdatedAt };
}

export async function resolveTinderBackendSyncDecision(externalThreadId: string, readResult: TinderBoundedReadResult, persistedCursor: string | null): Promise<TinderBackendSyncDecision> {
  const backend = await loadTinderConversationManagement(externalThreadId);
  const localRef = await getConversationRef(externalThreadId);
  const reconciliation = reconcileConversationRef(localRef?.conversationId ?? null, backend.conversationId);
  const cursorReconciliation = reconcileCursor(persistedCursor, backend.syncCursor);
  const effectiveCursor = cursorReconciliation === "local-missing" ? backend.syncCursor : persistedCursor;
  const candidate = readAiManagedTinderThreadSyncCandidate(readResult, backend.management);
  const identitySafe = reconciliation !== "conversation-mismatch" && reconciliation !== "backend-unmapped";
  const cursorSafe = cursorReconciliation !== "cursor-mismatch";
  const statusAllowsAutomation = conversationStatusAllowsTinderAutomation(backend.conversationStatus);
  const shouldSync = identitySafe && cursorSafe && statusAllowsAutomation && candidate ? shouldSyncAiManagedTinderThreadCandidate(candidate, effectiveCursor, backend.management) : false;

  const currentSyncState = await getSyncState();
  await saveSyncState({
    ...currentSyncState,
    reconciliationState: classifySyncReconciliation(persistedCursor, backend.syncCursor),
    message: reconcileAutomationPauseMessage(currentSyncState.message, backend.conversationStatus)
  });

  return { ...backend, candidate, shouldSync, statusAllowsAutomation, reconciliation, cursorReconciliation, effectiveCursor };
}
