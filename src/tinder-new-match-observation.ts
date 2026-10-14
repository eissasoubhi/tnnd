/** A true new-match claim requires an observed new tile *ahead* of a stable
 * known Tinder Matches baseline on TWO observations separated in time.
 * Links first seen in the middle/end of a lazy-loaded list are never queued. */
export interface NewMatchCandidate {
  ref: string;
  firstSeenAt: string;
  observations: number;
}
export interface NewMatchObservationState {
  schemaVersion: 3;
  enabled: boolean;
  userId: string | null;
  autoSendEnabled: boolean;
  mode?: "future" | "existing" | "watcher";
  baselineReady: boolean;
  seenRefs: string[];
  pendingRefs: string[];
  candidates: NewMatchCandidate[];
  completedRefs: string[];
  failedRefs: string[];
  lastAttemptAt: string | null;
  lastResult: string | null;
  updatedAt: string;
}
export const NEW_MATCH_MIN_CONFIRM_MS = 15000;
const LIMIT = 500;
function clean(refs: readonly string[]): string[] {
  return [...new Set(refs.filter(ref => typeof ref === "string")
    .map(ref => ref.trim()).filter(ref => ref.length > 0 && ref.length <= 512 && !ref.includes("/")))].slice(0, LIMIT);
}
export function emptyNewMatchState(): NewMatchObservationState {
  return { schemaVersion: 3, enabled: false, userId: null, autoSendEnabled: false, mode: "future",
    baselineReady: false, seenRefs: [], pendingRefs: [], candidates: [],
    completedRefs: [], failedRefs: [], lastAttemptAt: null, lastResult: null, updatedAt: "" };
}
export function armNewMatchObservation(
  refs: readonly string[], userId: string, now = new Date().toISOString()
): NewMatchObservationState {
  const known = clean(refs);
  if (!userId.trim() || known.length < 2) throw new Error("At least two visible match tiles are required for a safe baseline.");
  return { ...emptyNewMatchState(), enabled: true, userId, autoSendEnabled: true, mode: "future", baselineReady: true, seenRefs: known, updatedAt: now };
}
/** First-message batch for ALREADY VISIBLE Tinder Matches (not future matches).
 * Explicit confirmation is required before calling this. The backend must
 * separately prove a thread has no messages before any Send action.
 */
export function armExistingMatches(
  refs: readonly string[],
  userId: string,
  previous: NewMatchObservationState | null = null,
  now = new Date().toISOString()
): NewMatchObservationState {
  const known = clean(refs);
  if (!userId.trim() || !known.length) throw new Error("Open Tinder Matches with at least one visible match tile.");
  const prior = previous?.userId === userId ? previous : null;
  const completed = prior?.completedRefs ?? [];
  const failed = prior?.failedRefs ?? [];
  const alreadyAttempted = new Set([...completed, ...failed]);
  return {
    ...emptyNewMatchState(), enabled: true, userId,
    autoSendEnabled: true, mode: "existing", baselineReady: true,
    seenRefs: known, pendingRefs: known.filter(ref => !alreadyAttempted.has(ref)),
    completedRefs: completed, failedRefs: failed, updatedAt: now
  };
}

export function stopNewMatchObservation(state: NewMatchObservationState): NewMatchObservationState {
  return { ...state, enabled: false, autoSendEnabled: false };
}
export function observeNewMatchLinks(
  state: NewMatchObservationState, refs: readonly string[], now = new Date().toISOString()
): NewMatchObservationState {
  if (!state.enabled || !state.baselineReady || state.mode === "existing" || state.mode === "watcher") return state;
  const current = clean(refs);
  if (current.length < 2) return state;
  const previouslySeen = new Set(state.seenRefs);
  const firstKnownIndex = current.findIndex(ref => previouslySeen.has(ref));
  const freshPrefix = firstKnownIndex > 0 && firstKnownIndex <= 3
    ? current.slice(0, firstKnownIndex).filter(ref => !previouslySeen.has(ref))
    : [];
  const candidateByRef = new Map(state.candidates.map(c => [c.ref, c]));
  const pending = new Set(state.pendingRefs);
  const completed = new Set([...state.completedRefs, ...state.failedRefs]);
  for (const ref of freshPrefix) {
    if (completed.has(ref) || pending.has(ref)) continue;
    const existing = candidateByRef.get(ref);
    const candidate = existing
      ? { ...existing, observations: existing.observations + 1 }
      : { ref, firstSeenAt: now, observations: 1 };
    if (candidate.observations >= 2 && Date.parse(now) - Date.parse(candidate.firstSeenAt) >= NEW_MATCH_MIN_CONFIRM_MS) {
      pending.add(ref);
      candidateByRef.delete(ref);
    } else {
      candidateByRef.set(ref, candidate);
    }
  }
  // Candidates must remain at the start of the SAME Matches view, not a
  // newly loaded old tile at the bottom or another user's tab.
  for (const [ref] of candidateByRef) {
    if (!freshPrefix.includes(ref)) candidateByRef.delete(ref);
  }
  return { ...state,
    seenRefs: clean([...state.seenRefs, ...current.filter(ref => !candidateByRef.has(ref))]),
    pendingRefs: clean([...pending]),
    candidates: [...candidateByRef.values()].slice(0, 6),
    updatedAt: now
  };
}
export function finishNewMatchAttempt(
  state: NewMatchObservationState, ref: string, sent: boolean, reason: string,
  now = new Date().toISOString()
): NewMatchObservationState {
  return { ...state, pendingRefs: state.pendingRefs.filter(x => x !== ref),
    completedRefs: sent ? clean([...state.completedRefs, ref]) : state.completedRefs,
    failedRefs: sent ? state.failedRefs : clean([...state.failedRefs, ref]),
    lastAttemptAt: now, lastResult: reason, updatedAt: now };
}
export function isNewMatchObservationState(value: unknown): value is NewMatchObservationState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<NewMatchObservationState>;
  return v.schemaVersion === 3 && typeof v.enabled === "boolean"
    && typeof v.autoSendEnabled === "boolean" && (v.userId === null || typeof v.userId === "string")
    && typeof v.baselineReady === "boolean"
    && Array.isArray(v.seenRefs) && v.seenRefs.every(x => typeof x === "string")
    && Array.isArray(v.pendingRefs) && v.pendingRefs.every(x => typeof x === "string")
    && Array.isArray(v.candidates) && v.candidates.every(x => Boolean(x && typeof x.ref === "string" && typeof x.firstSeenAt === "string" && typeof x.observations === "number"))
    && Array.isArray(v.completedRefs) && v.completedRefs.every(x => typeof x === "string")
    && Array.isArray(v.failedRefs) && v.failedRefs.every(x => typeof x === "string")
    && typeof v.updatedAt === "string";
}
