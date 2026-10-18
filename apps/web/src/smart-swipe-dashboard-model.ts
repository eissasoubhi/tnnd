/** Server records attempts and observed card transitions, never Tinder receipts. */
export interface SmartSwipeAttemptSummary {
  dayKey: string;
  attemptsToday: number;
  uiObservedToday: number;
  unresolvedAttempts: number;
}
export interface SmartSwipeAttempt {
  dayKey: string;
  status: "reserved" | "ui_observed" | "uncertain";
  createdAt: string;
  resolvedAt: string | null;
  outcomeReason: string | null;
}
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const day = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export function parseSmartSwipeSummary(value: unknown): SmartSwipeAttemptSummary | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (!day(item.dayKey) || !count(item.attemptsToday) || !count(item.uiObservedToday) ||
      !count(item.unresolvedAttempts) || item.uiObservedToday > item.attemptsToday) return null;
  return { dayKey: item.dayKey, attemptsToday: item.attemptsToday,
    uiObservedToday: item.uiObservedToday, unresolvedAttempts: item.unresolvedAttempts };
}

export function parseSmartSwipeHistory(value: unknown): SmartSwipeAttempt[] | null {
  if (!value || typeof value !== "object" ||
      !Array.isArray((value as { attempts?: unknown }).attempts)) return null;
  const attempts = (value as { attempts: unknown[] }).attempts;
  if (attempts.length > 30) return null;
  const parsed: SmartSwipeAttempt[] = [];
  for (const raw of attempts) {
    if (!raw || typeof raw !== "object") return null;
    const item = raw as Record<string, unknown>;
    if (!day(item.dayKey) ||
        !["reserved", "ui_observed", "uncertain"].includes(String(item.status)) ||
        typeof item.createdAt !== "string" || !Number.isFinite(Date.parse(item.createdAt)) ||
        (item.resolvedAt !== null &&
          (typeof item.resolvedAt !== "string" || !Number.isFinite(Date.parse(item.resolvedAt))))) return null;
    // Older API/rows have no reason. Never invent one.
    const reason = item.outcomeReason;
    if (reason !== undefined && reason !== null &&
        (typeof reason !== "string" || !/^[a-z_]{1,64}$/.test(reason))) return null;
    parsed.push({
      dayKey: item.dayKey,
      status: item.status as SmartSwipeAttempt["status"],
      createdAt: item.createdAt, resolvedAt: item.resolvedAt,
      outcomeReason: typeof reason === "string" ? reason : null
    });
  }
  return parsed;
}

export function remainingSmartSwipeAttempts(summary: SmartSwipeAttemptSummary, cap: number): number | null {
  if (!Number.isSafeInteger(cap) || cap < 1) return null;
  return Math.max(0, cap - summary.attemptsToday);
}


/** Actionable, non-sensitive diagnostics for the two authenticated ledger endpoints.
 * Never fall back to a zero count when the server is unavailable.
 */
export function smartSwipeLedgerError(
  resource: "summary" | "history", status: number | "network" | "invalid"
): string {
  const name = resource === "summary" ? "Daily attempt counts" : "Recent attempts";
  if (status === "network") return name + " unavailable: cannot reach the TNND API. Check that the local backend is running.";
  if (status === "invalid") return name + " unavailable: invalid API response. Check that TNND Web and API are on compatible versions.";
  if (status === 401) return name + " unavailable: your TNND session may have expired. Sign in again.";
  if (status === 403) return name + " unavailable: account access denied. Check your TNND sign-in.";
  if (status === 404) return name + " unavailable: endpoint not found. Update and restart the TNND API.";
  if (status >= 500) return name + " unavailable: TNND API error (HTTP " + status +
    "). Check backend logs and ensure PostgreSQL migrations are applied; do not reset attempt data.";
  return name + " unavailable (HTTP " + status + "). Check TNND API logs.";
}

/** Display only fixed, non-identifying messages; never render arbitrary API codes as user text. */
const knownOutcomeExplanations: Record<string, string> = {
  new_card_visually_observed: "A new card was visible; Tinder acceptance remains unverified",
  another_like_in_flight: "Another Like was already in progress",
  recent_user_interaction: "Recent manual interaction prevented a Like",
  unsafe_discovery_state: "Discovery state was unsafe",
  like_or_card_not_unique: "Current card or Like control was ambiguous",
  preflight_state_changed: "The Discovery view changed before the click",
  modal_or_navigation_after_click: "A modal or navigation appeared after the click",
  card_transition_timeout: "No card change was observed before timeout",
  like_action_exception: "The Like executor failed; outcome is unknown",
  route_or_modal_changed: "The Tinder view or modal changed after the click",
  insufficient_transition_evidence: "Card transition evidence was insufficient",
  card_not_confirmed_changed: "Card change could not be confirmed",
  action_result_unavailable: "The Like executor returned no reliable outcome",
  pre_action_guard_blocked: "An ownership safety check blocked the action before sending"
};
export function describeSwipeOutcomeReason(reason: string | null): string {
  return reason === null ? "Technical reason not recorded by this version"
    : knownOutcomeExplanations[reason] ?? "Unrecognized technical outcome (still requires review)";
}
