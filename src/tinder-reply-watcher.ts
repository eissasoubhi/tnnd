import type { ExistingThreadIndex } from "./tinder-existing-thread-index";

/** Watch mode only responds to positive evidence, never a broad sweep.
 * Incoming from the saved backend is trustworthy only until that exact
 * version has been checked. Unread DOM hints can override stale backend
 * outgoing state. The actual opened chat is revalidated before any send.
 */
export function nextWatchedReply(state: ExistingThreadIndex): string | null {
  const pending = state.threads.filter(entry =>
    entry.queuedAt !== null
    && (entry.unreadAt !== null || (
      entry.lastMessageDirection === "incoming" &&
      entry.serverMessageAt !== null &&
      entry.checkedMessageAt !== entry.serverMessageAt
    ))
  );
  pending.sort((a,b) =>
    Number(b.unreadAt !== null) - Number(a.unreadAt !== null)
    || (a.queuedAt ?? "").localeCompare(b.queuedAt ?? "")
    || a.ref.localeCompare(b.ref)
  );
  return pending[0]?.ref ?? null;
}

export function pendingWatchedReplies(state: ExistingThreadIndex): number {
  return state.threads.filter(entry =>
    entry.queuedAt !== null && (
      entry.unreadAt !== null || (
        entry.lastMessageDirection === "incoming" && entry.serverMessageAt !== null
        && entry.serverMessageAt !== entry.checkedMessageAt
      )
    )).length;
}

export type WatcherDisplayStatus = "stopped" | "waiting" | "new-replies"
  | "processing" | "paused" | "disconnected";
export function watcherDisplayStatus(state: {
  enabled: boolean;
  pausedOnStop: boolean;
  phase: string;
  phaseDetail: string;
  pendingReplies: number;
}): WatcherDisplayStatus {
  if (!state.enabled) return state.pausedOnStop ? "paused" : "stopped";
  if (state.phase === "error" || /tab.*disconnect|tab.*navigated|receiver.*missing/i.test(state.phaseDetail)) {
    return "disconnected";
  }
  if (["loading", "generating", "sending", "sent"].includes(state.phase)) return "processing";
  return state.pendingReplies > 0 ? "new-replies" : "waiting";
}
