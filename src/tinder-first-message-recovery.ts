import type { NewMatchObservationState } from "./tinder-new-match-observation";
import { firstMessageAttemptKey } from "./tinder-first-message";

/** After an explicit NEW user click on Start, only requeue failed openers
 * whose first-message attempt is provably absent from BOTH durable journals.
 * This recovers pre-send SPA authorization failures without retrying any
 * potentially sent / uncertain delivery attempts.
 */
export function recoverVerifiedPreSendFailures(
  prior: NewMatchObservationState,
  claimedRefs: ReadonlySet<string>,
  processedKeys: ReadonlySet<string>
): { prior: NewMatchObservationState; recovered: string[] } {
  const recovered = prior.failedRefs.filter(ref =>
    !claimedRefs.has(ref) && !processedKeys.has(firstMessageAttemptKey(ref))
  );
  if (!recovered.length) return { prior, recovered };
  const allowed = new Set(recovered);
  return {
    prior: { ...prior, failedRefs: prior.failedRefs.filter(ref => !allowed.has(ref)) },
    recovered
  };
}
