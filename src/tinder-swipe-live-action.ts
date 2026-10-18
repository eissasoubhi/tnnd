import { observeSwipeDiscoveryControls } from "./tinder-swipe-discovery-evidence.ts";
import { readCurrentTinderUiState } from "./tinder-runtime-state";
import { classifySwipeCardTransition, type TinderSwipeActionResult } from "./tinder-swipe-card-transition-policy";
import { activeTinderDiscoveryCardMarker } from "./tinder-swipe-card-marker";
import { findUpgradeLikeOffer } from "./tinder-swipe-upgrade-like-offer";

/** No profile fields or image URL are ever persisted, returned, logged or exported.
 * The private marker is used only inside a single in-memory attempt.
 */

function singleLiveLike(doc: Document): HTMLButtonElement | null {
  const matches = Array.from(doc.querySelectorAll<HTMLButtonElement>("button.gamepad-button"))
    .filter(el => el.classList.contains("Bgc($c-ds-background-gamepad-sparks-like-default)") &&
      el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0 &&
      !el.disabled && el.getAttribute("aria-disabled") !== "true");
  return matches.length === 1 ? matches[0] : null;
}

const wait = (durationMs: number) => new Promise<void>(resolve => setTimeout(resolve, durationMs));
let clickInFlight = false;
let lastTrustedUserActionAt = 0;
// Observations only. Never intercept, prevent, delay or replay user events.
for (const eventType of ["pointerdown", "keydown", "touchstart"]) {
  document.addEventListener(eventType, event => {
    if (event.isTrusted) lastTrustedUserActionAt = Date.now();
  }, { capture: true, passive: true });
}
const userRecentlyActive = () => Date.now() - lastTrustedUserActionAt < 8000;

/** Intended to be invoked only after an atomically persisted, account-scoped
 * reservation and lease have been confirmed by the background worker.
 * Never retries or confirms a server receipt. On uncertainty the caller must
 * leave its reserved journal entry unresolved until manual reconciliation.
 */
export async function executeReservedTinderRightLike(): Promise<TinderSwipeActionResult> {
  if (clickInFlight) return { status: "blocked", reason: "another_like_in_flight", serverConfirmed: false };
  clickInFlight = true;
  try {
    if (userRecentlyActive()) {
      return { status: "blocked", reason: "recent_user_interaction", serverConfirmed: false };
    }
    const ui = readCurrentTinderUiState();
    if (location.pathname !== "/app/recs" || !ui.boundedActionAllowed)
      return { status: "blocked", reason: "unsafe_discovery_state", serverConfirmed: false };
    const evidence = observeSwipeDiscoveryControls(document, location.pathname, false);
    const button = singleLiveLike(document);
    const first = activeTinderDiscoveryCardMarker(document);
    if (evidence.status !== "observed" || !button || !first)
      return { status: "blocked", reason: "like_or_card_not_unique", serverConfirmed: false };
    await wait(250);
    if (location.pathname !== "/app/recs" || !readCurrentTinderUiState().boundedActionAllowed ||
        first !== activeTinderDiscoveryCardMarker(document) || !button.isConnected ||
        button.disabled || userRecentlyActive() || singleLiveLike(document) !== button)
      return { status: "blocked", reason: "preflight_state_changed", serverConfirmed: false };

    // Exactly one irreversible action. Do not dispatch artificial pointer
    // events, call hidden endpoints, or bypass the host's own safeguards.
    button.click();
    let dismissedUpgradeOfferAt: number | null = null;
    // This is still ONE Like attempt. A subsequent click, if any, is ONLY on
    // the verified "No Thanks" dismissal of Tinder's own post-Like upsell.
    // Never click Send Super Like, retry the Like or infer Tinder acceptance.
    const expiresAt = Date.now() + 7000;
    while (Date.now() < expiresAt) {
      await wait(200);
      const offer = findUpgradeLikeOffer(document);
      if (offer.status === "recognized") {
        if (dismissedUpgradeOfferAt !== null) {
          // Tinder may take a moment to remove the same modal; do not click
          // again. If it persists, report unknown and require manual review.
          if (Date.now() - dismissedUpgradeOfferAt > 1800)
            return { status: "uncertain", reason: "modal_or_navigation_after_click", serverConfirmed: false };
          continue;
        }
        // Only while still on Discovery, with no trusted manual interaction.
        if (location.pathname !== "/app/recs" || userRecentlyActive())
          return { status: "uncertain", reason: "modal_or_navigation_after_click", serverConfirmed: false };
        await wait(120);
        const rechecked = findUpgradeLikeOffer(document);
        if (rechecked.status !== "recognized" ||
            rechecked.dismissButton !== offer.dismissButton ||
            !offer.dismissButton.isConnected || userRecentlyActive())
          return { status: "uncertain", reason: "modal_or_navigation_after_click", serverConfirmed: false };
        dismissedUpgradeOfferAt = Date.now();
        rechecked.dismissButton.click(); // Exact "No Thanks" only, once.
        continue;
      }
      if (offer.status === "ambiguous")
        return { status: "uncertain", reason: "modal_or_navigation_after_click", serverConfirmed: false };
      const current = readCurrentTinderUiState();
      const after = activeTinderDiscoveryCardMarker(document);
      if (after && first !== after) {
        await wait(750); // allow any delayed Tinder post-Like upsell to appear
        const stabilizedOffer = findUpgradeLikeOffer(document);
        if (stabilizedOffer.status === "recognized") continue;
        if (stabilizedOffer.status === "ambiguous")
          return { status: "uncertain", reason: "modal_or_navigation_after_click", serverConfirmed: false };
        const latest = readCurrentTinderUiState();
        const controls = observeSwipeDiscoveryControls(
          document, location.pathname, !latest.boundedActionAllowed);
        return classifySwipeCardTransition(
          first, activeTinderDiscoveryCardMarker(document),
          location.pathname === "/app/recs",
          controls.status === "observed",
          !latest.boundedActionAllowed
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
