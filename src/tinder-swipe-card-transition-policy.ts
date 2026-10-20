/** A browser card transition is not a server-side Like receipt. */
export type TinderSwipeActionResult = {
  status: "blocked" | "ui_observed" | "uncertain";
  reason: string;
  serverConfirmed: false;
};
export function classifySwipeCardTransition(
  before: string | null, after: string | null,
  routeStillRecs: boolean, safeControls: boolean, visibleModal: boolean
): TinderSwipeActionResult {
  if (!routeStillRecs || visibleModal) return { status: "uncertain", reason: "route_or_modal_changed", serverConfirmed: false };
  if (!before || !after || !safeControls) return { status: "uncertain", reason: "insufficient_transition_evidence", serverConfirmed: false };
  if (before === after) return { status: "uncertain", reason: "card_not_confirmed_changed", serverConfirmed: false };
  return { status: "ui_observed", reason: "new_card_visually_observed", serverConfirmed: false };
}


/** The content executor returns these codes ONLY before its button.click().
 * A timeout, navigation, modal, thrown click, lost result, or any unknown
 * error can mean that a Like DID occur and must remain uncertain.
 */
export const NO_CLICK_BLOCK_REASONS = [
  "another_like_in_flight", "recent_user_interaction", "unsafe_discovery_state",
  "like_or_card_not_unique", "preflight_state_changed"
] as const;
export function isProvenNoClickResult(value: TinderSwipeActionResult | null): boolean {
  return value?.status === "blocked" &&
    NO_CLICK_BLOCK_REASONS.some(reason => reason === value.reason);
}
