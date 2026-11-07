/** Single Tinder tab, one live UI owner. Data reads may run beside Swipe,
 * but navigation and irreversible actions NEVER run in parallel.
 * The persisted backlog covers old AND newly incoming unanswered messages.
 */
export const INBOX_SCAN_INTERVAL_MS = 5 * 60_000;
export const INBOX_MIN_DWELL_MS = 45_000;

export interface SingleTabRotation {
  owner: "swipe" | "watcher";
  pendingReplies: number | null;
  lastInboxVisitAt: number;
  watcherStartedAt: number | null;
  lastMatchScanAt: string | null;
  matchPhase: string | null;
  watcherSafe: boolean;
  now: number;
}

export function nextSingleTabRotation(input: SingleTabRotation): "inbox" | "swipe" | "wait" {
  if (input.owner === "swipe") {
    // Backlog has absolute priority over periodic discovery. Old messages
    // are included because pendingReplies is based on server direction AND
    // the persistent unhandled-thread index rather than a "new" DOM badge.
    if (input.pendingReplies !== null && input.pendingReplies > 0) return "inbox";
    return input.now - input.lastInboxVisitAt >= INBOX_SCAN_INTERVAL_MS ? "inbox" : "wait";
  }
  // No automatic departure on an unknown inbox, even when watcher reports 0.
  if (input.pendingReplies === null || input.pendingReplies > 0 ||
      !input.watcherSafe || input.watcherStartedAt === null ||
      input.now - input.watcherStartedAt < INBOX_MIN_DWELL_MS ||
      input.matchPhase !== "idle") return "wait";
  // The Matches scan must have been attempted during THIS visit; otherwise
  // returning to Swipe could silently starve never-seen new matches.
  const scannedAt = Date.parse(input.lastMatchScanAt ?? "");
  return Number.isFinite(scannedAt) && scannedAt >= input.watcherStartedAt
    ? "swipe" : "wait";
}
