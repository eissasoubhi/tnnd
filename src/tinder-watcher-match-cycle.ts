/** Unified Tinder watcher schedule. Pure policy: a reply or an active send
 * always wins over Matches inspection/first openers. Never use a second tab.
 */
export const WATCHER_MATCH_SCAN_INTERVAL_MS = 5 * 60_000;
export const WATCHER_MATCH_VERIFICATION_MS = 16_000;
export const WATCHER_MATCH_SCAN_TIMEOUT_MS = 65_000;
export const WATCHER_OPENER_RECOVERY_MS = 180_000;
export type WatcherMatchPhase = "idle" | "verifying" | "opener";
export interface WatcherMatchCycle {
  matchPhase: WatcherMatchPhase;
  lastMatchScanAt: string | null;
  lastIncomingAt?: string | null;
  matchPhaseStartedAt: string | null;
  autoOpenersEnabled: boolean;
}
export type WatcherMatchAction = "none" | "scan" | "verify" | "recover";
const stamp = (v: string | null): number | null => {
  if (!v) return null;
  const parsed = Date.parse(v);
  return Number.isFinite(parsed) ? parsed : null;
};
export function nextWatcherMatchAction(
  state: WatcherMatchCycle,
  options: { activeFollow: boolean; pendingReplies: number; replyProcessing: boolean; now?: number }
): WatcherMatchAction {
  const now = options.now ?? Date.now();
  const started = stamp(state.matchPhaseStartedAt);
  if (state.matchPhase === "opener")
    return started === null || now - started >= WATCHER_OPENER_RECOVERY_MS ? "recover" : "none";
  if (state.matchPhase === "verifying") {
    if (started === null || now - started >= WATCHER_MATCH_SCAN_TIMEOUT_MS
      || options.pendingReplies > 0 || options.replyProcessing || options.activeFollow)
      return "recover";
    return now - started >= WATCHER_MATCH_VERIFICATION_MS ? "verify" : "none";
  }
  if (options.activeFollow || options.replyProcessing || options.pendingReplies > 0) return "none";
  const previous = Math.max(stamp(state.lastMatchScanAt) ?? 0, stamp(state.lastIncomingAt ?? null) ?? 0);
  return previous === 0 || now - previous >= WATCHER_MATCH_SCAN_INTERVAL_MS ? "scan" : "none";
}

export function nextMatchOpener(
  existingRefs: readonly string[],
  newRefs: readonly string[],
  attemptedRefs: readonly string[],
): string | null {
  const attempted = new Set(attemptedRefs);
  // Recently verified new matches first, then unmatched existing tiles. Both
  // still require the same backend empty-thread proof and Send authorization.
  return [...newRefs, ...existingRefs].find(ref =>
    /^[a-zA-Z0-9_-]{3,512}$/.test(ref) && !attempted.has(ref)) ?? null;
}
