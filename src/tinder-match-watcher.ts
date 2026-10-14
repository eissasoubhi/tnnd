import { emptyNewMatchState, observeNewMatchLinks, type NewMatchObservationState } from "./tinder-new-match-observation.ts";

/** Read-only inventory scoped to the authenticated TNND user, never a send queue.
 * First visible Matches snapshot is the EXISTING baseline; later top-of-list
 * arrivals must be observed twice with a >=15s gap before tagged as NEW.
 * Offscreen Tinder tiles cannot be watched until they are actually rendered.
 */
export interface WatchedMatches {
  schemaVersion: 1;
  userId: string;
  baselineReady: boolean;
  observer: NewMatchObservationState;
  existingRefs: string[];
  newRefs: string[];
  observedAt: string | null;
}
const LIMIT = 500;
const valid = (ref: unknown): ref is string =>
  typeof ref === "string" && /^[a-zA-Z0-9_-]{3,512}$/.test(ref);
const clean = (refs: readonly unknown[]): string[] =>
  [...new Set(refs.filter(valid))].slice(0, LIMIT);

export function emptyWatchedMatches(userId: string): WatchedMatches {
  return { schemaVersion: 1, userId, baselineReady: false,
    observer: { ...emptyNewMatchState(), enabled: true, userId, autoSendEnabled: false },
    existingRefs: [], newRefs: [], observedAt: null };
}
export function isWatchedMatches(value: unknown, userId: string): value is WatchedMatches {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Partial<WatchedMatches>;
  return state.schemaVersion === 1 && state.userId === userId
    && typeof state.baselineReady === "boolean"
    && Array.isArray(state.existingRefs) && state.existingRefs.every(valid)
    && Array.isArray(state.newRefs) && state.newRefs.every(valid)
    && !!state.observer && Array.isArray(state.observer.seenRefs)
    && Array.isArray(state.observer.pendingRefs);
}
export function observeWatchedMatches(
  previous: WatchedMatches,
  observed: readonly unknown[],
  now = new Date().toISOString()
): WatchedMatches {
  const refs = clean(observed);
  if (!refs.length) return previous; // empty DOM is not proof of no matches
  if (!previous.baselineReady) {
    return {
      ...previous, baselineReady: true, existingRefs: refs, observedAt: now,
      observer: { ...emptyNewMatchState(), enabled: true, userId: previous.userId,
        autoSendEnabled: false, mode: "future", baselineReady: refs.length >= 2,
        seenRefs: refs, updatedAt: now }
    };
  }
  // A single tile is not enough to verify future arrival position. Retain
  // the previous baseline instead of incorrectly marking anything as "new".
  if (refs.length < 2) return { ...previous, observedAt: now };
  const observer = previous.observer.baselineReady
    ? observeNewMatchLinks(previous.observer, refs, now)
    : { ...previous.observer, baselineReady: true, seenRefs: clean([...previous.observer.seenRefs, ...refs]), updatedAt: now };
  const newRefs = clean([...previous.newRefs, ...observer.pendingRefs]);
  const classified = new Set([...previous.existingRefs, ...newRefs, ...observer.candidates.map(c => c.ref)]);
  const existingRefs = clean([...previous.existingRefs,
    ...refs.filter(ref => !classified.has(ref) && observer.seenRefs.includes(ref))]);
  return { ...previous, observer, existingRefs, newRefs, observedAt: now };
}
export function watchedMatchCounts(state: WatchedMatches): { existing: number; new: number; pending: number } {
  return { existing: state.existingRefs.length, new: state.newRefs.length,
    pending: state.observer.candidates.length };
}
