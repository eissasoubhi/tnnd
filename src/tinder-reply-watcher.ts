import { shouldKeepConversationInFocus, type ConversationActivity } from "./tinder-conversation-activity.ts";
import { RECHECK_IDLE_MS, type ExistingThreadIndex, type IndexedThread } from "./tinder-existing-thread-index.ts";

/** Watch mode only responds to positive evidence, never a broad sweep.
 * Incoming from the saved backend is trustworthy only until that exact
 * version has been checked. Unread DOM hints can override stale backend
 * outgoing state. The actual opened chat is revalidated before any send.
 */
/** Revisit a checked incoming thread only when its scheduled cooldown has
 * elapsed. This does NOT permit a send: content.ts still verifies fresh Tinder
 * direction, backend authorization and its durable processed/send claim.
 */
function actionableWatcherCandidate(entry: IndexedThread): boolean {
  if (entry.queuedAt === null) return false;
  if (entry.unreadAt !== null) return true;
  // Tinder-only conversations must be inspected even if they do not have an
  // unread badge and have never appeared in the database. No send is
  // authorized here: Tinder content/backend permissions still decide.
  if (entry.tinderSeenAt && entry.lastMessageDirection === null) {
    if (!entry.lastCheckedAt) return true;
    return Date.parse(entry.queuedAt) - Date.parse(entry.lastCheckedAt) >= 30 * 60_000;
  }
  if (entry.lastMessageDirection !== "incoming" || entry.serverMessageAt === null) return false;
  if (entry.checkedMessageAt !== entry.serverMessageAt) return true;
  if (!entry.lastCheckedAt) return false;
  const queued = Date.parse(entry.queuedAt);
  const checked = Date.parse(entry.lastCheckedAt);
  return Number.isFinite(queued) && Number.isFinite(checked) &&
    queued - checked >= RECHECK_IDLE_MS;
}
/** Prioritize factual evidence of a fresh incoming unanswered turn.
 * No semantic regex/AI guess or pseudo-random ordering is needed here.
 * A stale outgoing row with an unread badge is a useful CHECK, but must
 * not outrank a verified newer incoming version. Rechecks go last.
 * These hints never authorize a send; live Tinder and backend gates do.
 */
export function watcherReplyPriority(entry: IndexedThread): number {
  const newIncoming = entry.lastMessageDirection === "incoming" &&
    entry.serverMessageAt !== null &&
    entry.serverMessageAt !== entry.checkedMessageAt;
  if (newIncoming && entry.unreadAt !== null) return 4;
  if (newIncoming) return 3;
  if (entry.unreadAt !== null) return 2;
  return 1; // Previously checked incoming chat awaiting safe re-verification.
}

export function nextWatchedReply(state: ExistingThreadIndex): string | null {
  const pending = state.threads.filter(actionableWatcherCandidate);
  pending.sort((a,b) =>
    watcherReplyPriority(b) - watcherReplyPriority(a)
    || (a.queuedAt ?? "").localeCompare(b.queuedAt ?? "")
    || a.ref.localeCompare(b.ref)
  );
  return pending[0]?.ref ?? null;
}

export function pendingWatchedReplies(state: ExistingThreadIndex): number {
  return state.threads.filter(actionableWatcherCandidate).length;
}

/** Automatic mode should interrupt Swipe only for evidence that has NOT
 * been checked yet. Periodic retries of already-reviewed old conversations
 * stay as maintenance work, never as permanent active-chat backlog.
 * The opened Tinder thread is still revalidated before any actual Send.
 */
export function immediateWatcherCandidate(entry: IndexedThread): boolean {
  if (entry.queuedAt === null) return false;
  const checkedAt = entry.lastCheckedAt ? Date.parse(entry.lastCheckedAt) : Number.NaN;
  const unreadAt = entry.unreadAt ? Date.parse(entry.unreadAt) : Number.NaN;
  if (Number.isFinite(unreadAt) &&
      (!Number.isFinite(checkedAt) || unreadAt > checkedAt)) return true;
  if (entry.lastMessageDirection === "incoming" && entry.serverMessageAt &&
      entry.checkedMessageAt !== entry.serverMessageAt) return true;
  // First visit for a newly discovered Tinder-only chat. Once checked, it
  // must not keep Swipe suspended while waiting for someone to reply.
  return entry.lastMessageDirection === null && Boolean(entry.tinderSeenAt) &&
    entry.lastCheckedAt === null;
}

export function pendingImmediateWatcherReplies(state: ExistingThreadIndex): number {
  return state.threads.filter(immediateWatcherCandidate).length;
}

export function nextImmediateWatchedReply(state: ExistingThreadIndex): string | null {
  const candidates = state.threads.filter(immediateWatcherCandidate);
  candidates.sort((a,b) =>
    watcherReplyPriority(b) - watcherReplyPriority(a)
    || (a.queuedAt ?? "").localeCompare(b.queuedAt ?? "")
    || a.ref.localeCompare(b.ref)
  );
  return candidates[0]?.ref ?? null;
}

export type WatcherDisplayStatus = "stopped" | "waiting" | "new-replies"
  | "following" | "processing" | "paused" | "disconnected";
export function watcherDisplayStatus(state: {
  enabled: boolean;
  pausedOnStop: boolean;
  phase: string;
  phaseDetail: string;
  pendingReplies: number;
  activeConversationRef?: string | null;
  activeConversationUntil?: string | null;
  lastRef?: string | null;
  conversationActivities?: ConversationActivity[];
}): WatcherDisplayStatus {
  if (state.phase === "error" && /receiver|missing|disconnect|tab|navigate/i.test(state.phaseDetail)) return "disconnected";
  if (!state.enabled) return state.pausedOnStop ? "paused" : "stopped";
  if (state.phase === "error" || /tab.*disconnect|tab.*navigated|receiver.*missing/i.test(state.phaseDetail)) return "disconnected";
  if (["loading", "generating", "sending"].includes(state.phase)) return "processing";
  if (state.activeConversationRef && state.activeConversationUntil
    && Date.parse(state.activeConversationUntil) > Date.now()
    && (!state.conversationActivities || shouldKeepConversationInFocus({
      activeConversationRef: state.activeConversationRef,
      activeConversationUntil: state.activeConversationUntil,
      conversationActivities: state.conversationActivities
    }, state.lastRef ?? null, [state.activeConversationRef]))) return "following";
  return state.pendingReplies > 0 ? "new-replies" : "waiting";
}

// Remember which unread badges are still visible: a lingering badge must not
// generate another event on every 30-second watcher snapshot.
export function newlyVisibleUnread(previous: readonly string[], current: readonly string[]): string[] {
  const old = new Set(previous);
  return [...new Set(current)].filter(ref => !old.has(ref));
}
