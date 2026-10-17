/** Explicit read-only bulk import of the currently loaded Tinder Messages list.
 * Match tiles without a conversation are intentionally outside this inventory.
 */
export interface BulkSyncProgress {
  active: boolean;
  collecting?: boolean;
  stopReason?: string | null;
  userId: string;
  tabId: number;
  refs: string[];
  done: string[];
  failed: Record<string, string>;
  partial: string[];
  initialRef: string | null;
  lastRef: string | null;
  startedAt: string;
  updatedAt: string;
}
export function safeBulkRefs(refs: unknown, max = 200): string[] {
  if (!Array.isArray(refs)) return [];
  const valid = new Set<string>();
  for (const ref of refs) {
    if (typeof ref !== "string" || !/^[a-zA-Z0-9_-]{3,512}$/.test(ref)) continue;
    valid.add(ref);
    if (valid.size >= max) break;
  }
  return [...valid];
}
export function bulkSyncCounts(state: BulkSyncProgress): {
  selected: number; completed: number; failed: number; partial: number; pending: number
} {
  const selected = state.refs.length;
  const done = new Set(state.done.filter(ref=>state.refs.includes(ref)));
  const failures = state.refs.filter(ref=>!done.has(ref) && Object.hasOwn(state.failed,ref)).length;
  return {
    selected, completed: done.size, failed: failures,
    partial: state.partial.filter(ref=>done.has(ref)).length,
    pending: Math.max(0,selected-done.size-failures)
  };
}
export function nextBulkSyncRef(state: BulkSyncProgress): string | null {
  const completed = new Set(state.done);
  return state.refs.find(ref=>!completed.has(ref) && !Object.hasOwn(state.failed,ref)) ?? null;
}
export function canContinueBulkSync(
  state: BulkSyncProgress,
  context: { userId: string; tabId: number; currentRef: string | null; automationEnabled: boolean; otherRunnerActive: boolean }
): string | null {
  if (!state.active) return "batch_stopped";
  if (state.userId !== context.userId || state.tabId !== context.tabId) return "account_or_tab_changed";
  if (context.automationEnabled || context.otherRunnerActive) return "automatic_runner_must_be_disabled";
  if (context.currentRef !== (state.lastRef ?? state.initialRef)) return "manual_tinder_navigation_detected";
  return null;
}
