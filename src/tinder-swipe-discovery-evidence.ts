/**
 * Strict, read-only observation of Tinder's Discovery gamepad controls.
 * Evidence: user-supplied, redacted /app/recs diagnostics (steps 07/08).
 * Never clicks Tinder, reads profile identities, or authorizes an action.
 */
export type SwipeControlKind = "like" | "pass" | "super-like" | "rewind" | "unknown";

const EXACT_CLASS: Readonly<Record<Exclude<SwipeControlKind, "unknown">, string>> = {
  like: "Bgc($c-ds-background-gamepad-sparks-like-default)",
  pass: "Bgc($c-ds-background-gamepad-sparks-nope-default)",
  "super-like": "Bgc($c-ds-background-gamepad-sparks-super-like-default)",
  rewind: "Bgc($c-ds-background-gamepad-sparks-rewind-default)"
};

export interface SwipeControlFact {
  classes: readonly string[];
  visible: boolean;
  disabled: boolean;
}
export interface SwipeDiscoveryEvidence {
  version: 1;
  route: "recs" | "other";
  status: "observed" | "blocked" | "ambiguous" | "not-found";
  likeControls: number;
  passControls: number;
  superLikeControls: number;
  rewindControls: number;
  rewindEnabled: boolean;
  /** This is a DOM-only observation, never a server-confirmed Like. */
  actionConfirmed: false;
}

/** Exact token matches prevent a Like being mistaken for a Super Like or Likes You link. */
export function classifySwipeControl(classes: readonly string[]): SwipeControlKind {
  const found = (Object.entries(EXACT_CLASS) as Array<[Exclude<SwipeControlKind, "unknown">, string]>)
    .filter(([, token]) => classes.includes(token))
    .map(([kind]) => kind);
  return found.length === 1 ? found[0] : "unknown";
}

export function summarizeSwipeControls(
  pathname: string,
  controls: readonly SwipeControlFact[],
  blockedByOverlay: boolean
): SwipeDiscoveryEvidence {
  const recs = pathname.replace(/\/+$/, "") === "/app/recs";
  const results = controls.map(item => ({ ...item, kind: classifySwipeControl(item.classes) }));
  const count = (kind: SwipeControlKind) =>
    results.filter(item => item.kind === kind && item.visible && !item.disabled).length;
  const likeControls = count("like");
  const passControls = count("pass");
  const superLikeControls = count("super-like");
  const rewindControls = results.filter(item => item.kind === "rewind" && item.visible).length;
  const rewindEnabled = count("rewind") > 0;
  const status: SwipeDiscoveryEvidence["status"] =
    !recs || blockedByOverlay ? "blocked" :
      likeControls === 0 ? "not-found" :
        likeControls !== 1 || passControls !== 1 || superLikeControls < 1 ? "ambiguous" : "observed";
  return {
    version: 1, route: recs ? "recs" : "other", status,
    likeControls, passControls, superLikeControls, rewindControls,
    rewindEnabled, actionConfirmed: false
  };
}

function visibleButton(button: HTMLButtonElement): boolean {
  if (button.hidden || button.closest('[aria-hidden="true"],[hidden]')) return false;
  const style = getComputedStyle(button);
  if (style.display === "none" || style.visibility !== "visible" ||
      style.pointerEvents === "none" || Number(style.opacity) === 0) return false;
  const rect = button.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function observeSwipeDiscoveryControls(
  doc: Document,
  pathname: string,
  blockedByOverlay: boolean
): SwipeDiscoveryEvidence {
  const controls = Array.from(doc.querySelectorAll<HTMLButtonElement>("button.gamepad-button"))
    .slice(0, 32)
    .map(button => ({
      classes: [...button.classList],
      visible: visibleButton(button),
      disabled: button.disabled || button.getAttribute("aria-disabled") === "true"
    }));
  return summarizeSwipeControls(pathname, controls, blockedByOverlay);
}
