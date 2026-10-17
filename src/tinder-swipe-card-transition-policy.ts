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
