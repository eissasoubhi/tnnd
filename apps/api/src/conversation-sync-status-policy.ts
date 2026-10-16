import type { ConversationStatus } from "./conversation-sync-contract.js";

/** Sync is a passive observation, not a UI resume/unblock command.
 * An explicit authenticated status or management edit remains the only way
 * to re-enable automation after a manual pause or confirmed handoff.
 */
const protectedStatuses = new Set<ConversationStatus>([
  "paused", "disabled", "archived", "moved-off-tinder", "action-required"
]);
export function statusAfterPassiveSync(
  requested: ConversationStatus | undefined,
  existing: ConversationStatus | undefined
): ConversationStatus {
  if (existing && protectedStatuses.has(existing)) return existing;
  return requested ?? existing ?? "active";
}
