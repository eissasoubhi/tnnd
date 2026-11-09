/** Popup state is independent of the server's historical attempt status.
 * Disarming the extension is always possible and must be visible even when
 * a past attempt is still unresolved. Unknown ledger counts fail closed.
 */
export interface SwipePopupStatusInput {
  enabled: boolean;
  armed: boolean;
  unresolvedOnServer: number | null | undefined;
  /** Only recent, potentially in-flight claims block NEW Likes. */
  blockingUnresolvedOnServer?: number | null;
}

export interface SwipePopupState {
  phase: "disabled" | "stopped" | "blocked" | "armed";
  needsReview: boolean;
  ledgerUnavailable: boolean;
  startDisabled: boolean;
}

export function classifySwipePopupState(input: SwipePopupStatusInput): SwipePopupState {
  const validCount = typeof input.unresolvedOnServer === "number" &&
    Number.isSafeInteger(input.unresolvedOnServer) && input.unresolvedOnServer >= 0;
  const validActive = typeof input.blockingUnresolvedOnServer === "number" &&
    Number.isSafeInteger(input.blockingUnresolvedOnServer) &&
    input.blockingUnresolvedOnServer >= 0;
  // If a legacy backend does not report active claims, fail closed instead of
  // treating an unknown count as zero.
  const ledgerUnavailable = !validCount ||
    (input.blockingUnresolvedOnServer !== undefined && !validActive);
  const needsReview = !ledgerUnavailable &&
    (validActive ? input.blockingUnresolvedOnServer! > 0 : input.unresolvedOnServer! > 0);
  const startDisabled = !input.enabled || input.armed || needsReview || ledgerUnavailable;
  return {
    phase: !input.enabled ? "disabled"
      : !input.armed ? "stopped"
        : needsReview || ledgerUnavailable ? "blocked" : "armed",
    needsReview,
    ledgerUnavailable,
    startDisabled
  };
}
