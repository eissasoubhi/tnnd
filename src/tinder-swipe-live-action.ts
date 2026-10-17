import { observeSwipeDiscoveryControls } from "./tinder-swipe-discovery-evidence.ts";
import { readCurrentTinderUiState } from "./tinder-runtime-state";
import { classifySwipeCardTransition, type TinderSwipeActionResult } from "./tinder-swipe-card-transition-policy";

/** No profile fields or image URL are ever persisted, returned, logged or exported.
 * The private marker is used only inside a single in-memory attempt.
 */
function activeCardMarker(doc: Document): string | null {
  const photos = Array.from(doc.querySelectorAll<HTMLElement>(
    ".recsCardboard__cards .recCard__img [style*='url(']"
  )).filter(el => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 &&
      getComputedStyle(el).visibility === "visible";
  });
  if (photos.length !== 1) return null;
  const marker = photos[0].getAttribute("style");
  return marker && marker.includes("url(") ? marker : null;
}
function singleLiveLike(doc: Document): HTMLButtonElement | null {
  const matches = Array.from(doc.querySelectorAll<HTMLButtonElement>("button.gamepad-button"))
    .filter(el => el.classList.contains("Bgc($c-ds-background-gamepad-sparks-like-default)") &&
      el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 &&
      !el.disabled && el.getAttribute("aria-disabled") !== "true");
  return matches.length === 1 ? matches[0] : null;
}

const wait = (durationMs: number) => new Promise<void>(resolve => setTimeout(resolve, durationMs));
let clickInFlight = false;

/** Intended to be invoked only after an atomically persisted, account-scoped
 * reservation and lease have been confirmed by the background worker.
 * Never retries or confirms a server receipt. On uncertainty the caller must
 * leave its reserved journal entry unresolved until manual reconciliation.
 */
export async function executeReservedTinderRightLike(): Promise<TinderSwipeActionResult> {
  if (clickInFlight) return { status: "blocked", reason: "another_like_in_flight", serverConfirmed: false };
  clickInFlight = true;
  try {
    const ui = readCurrentTinderUiState();
    if (location.pathname !== "/app/recs" || !ui.boundedActionAllowed)
      return { status: "blocked", reason: "unsafe_discovery_state", serverConfirmed: false };
    const evidence = observeSwipeDiscoveryControls(document, location.pathname, false);
    const button = singleLiveLike(document);
    const first = activeCardMarker(document);
    if (evidence.status !== "observed" || !button || !first)
      return { status: "blocked", reason: "like_or_card_not_unique", serverConfirmed: false };
    await wait(250);
    if (location.pathname !== "/app/recs" || !readCurrentTinderUiState().boundedActionAllowed ||
        first !== activeCardMarker(document) || !button.isConnected ||
        button.disabled || singleLiveLike(document) !== button)
      return { status: "blocked", reason: "preflight_state_changed", serverConfirmed: false };

    // Exactly one irreversible action. Do not dispatch artificial pointer
    // events, call hidden endpoints, or bypass the host's own safeguards.
    button.click();
    const expiresAt = Date.now() + 5000;
    while (Date.now() < expiresAt) {
      await wait(200);
      const current = readCurrentTinderUiState();
      const after = activeCardMarker(document);
      const controls = observeSwipeDiscoveryControls(
        document, location.pathname, !current.boundedActionAllowed);
      if (after && first !== after) {
        await wait(350); // stabilization; no additional click
        return classifySwipeCardTransition(
          first, activeCardMarker(document),
          location.pathname === "/app/recs",
          controls.status === "observed",
          !readCurrentTinderUiState().boundedActionAllowed
        );
      }
      if (location.pathname !== "/app/recs" || !current.boundedActionAllowed) {
        return { status: "uncertain", reason: "modal_or_navigation_after_click", serverConfirmed: false };
      }
    }
    return { status: "uncertain", reason: "card_transition_timeout", serverConfirmed: false };
  } catch {
    return { status: "uncertain", reason: "like_action_exception", serverConfirmed: false };
  } finally { clickInFlight = false; }
}
