import { classifyTinderPath } from "./tinder-state-machine";

/** Read-only discovery UI evidence. Never captures names, photos, card text, or IDs.
 * These observations are not in themselves permission to click anything.
 */
export type DiscoveryActionKind = "like" | "pass" | "super-like" | "other";
export interface DiscoveryControlEvidence {
  kind: DiscoveryActionKind;
  source: "aria-label" | "data-testid" | "unrecognized";
  enabled: boolean;
  visible: boolean;
  element: "button" | "role-button";
}
export interface DiscoveryControlsSnapshot {
  schemaVersion: 1;
  route: "recs" | "other";
  blocked: boolean;
  reason: string;
  actions: DiscoveryControlEvidence[];
}

/** Classify safe *hints*, never trust substring 'like' (also matches 'dislike').
 * Raw labels/testids can contain private profile details and are never exported.
 */
export function classifyDiscoveryAction(hint: string): DiscoveryActionKind {
  const value = hint.normalize("NFKC").toLowerCase().replace(/[\s_-]+/g, " ").trim();
  if (/^(?:like|j aime|jaime|me gusta|curtir|like profile|gamepad like)$/.test(value)) return "like";
  if (/^(?:super like|superlike|gamepad super like)$/.test(value)) return "super-like";
  if (/^(?:nope|pass|dislike|skip|passer|gamepad nope)$/.test(value)) return "pass";
  return "other";
}

function isVisible(element: HTMLElement): boolean {
  if (element.offsetParent === null || element.getBoundingClientRect().width <= 0 ||
      element.getBoundingClientRect().height <= 0) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.pointerEvents !== "none";
}

export function observeDiscoveryControls(
  doc: Document = document,
  pathname = location.pathname
): DiscoveryControlsSnapshot {
  if (classifyTinderPath(pathname).discoveryContext !== "recs") {
    return { schemaVersion: 1, route: "other", blocked: true, reason: "not_tinder_recs", actions: [] };
  }
  const blocking = Array.from(doc.querySelectorAll<HTMLElement>('[role="dialog"],[aria-modal="true"]'))
    .some(element => isVisible(element));
  if (blocking) {
    return { schemaVersion: 1, route: "recs", blocked: true, reason: "blocking_modal", actions: [] };
  }
  const controls = Array.from(doc.querySelectorAll<HTMLElement>('button,[role="button"]'))
    .filter(element => !element.closest('nav,header,aside'))
    .slice(0, 150);
  const actions: DiscoveryControlEvidence[] = [];
  for (const el of controls) {
    const aria = el.getAttribute("aria-label") ?? "";
    const testid = el.getAttribute("data-testid") ?? "";
    const fromAria = classifyDiscoveryAction(aria);
    const fromTest = classifyDiscoveryAction(testid);
    if (fromAria === "other" && fromTest === "other") continue;
    if (fromAria !== "other" && fromTest !== "other" && fromAria !== fromTest) {
      return { schemaVersion: 1, route: "recs", blocked: true, reason: "conflicting_action_hints", actions: [] };
    }
    actions.push({
      kind: fromAria !== "other" ? fromAria : fromTest,
      source: fromAria !== "other" ? "aria-label" : "data-testid",
      enabled: !(el instanceof HTMLButtonElement && el.disabled) &&
        el.getAttribute("aria-disabled") !== "true",
      visible: isVisible(el),
      element: el.tagName.toLowerCase() === "button" ? "button" : "role-button"
    });
  }
  const visibleLikes = actions.filter(item => item.kind === "like" && item.visible && item.enabled);
  return {
    schemaVersion: 1,
    route: "recs",
    blocked: true, // Always fail closed until actual Tinder card transition is independently validated.
    reason: visibleLikes.length === 1 ? "like_control_observed_not_validated"
      : visibleLikes.length > 1 ? "ambiguous_like_controls" : "no_confirmed_like_control",
    actions: actions.slice(0, 30)
  };
}
