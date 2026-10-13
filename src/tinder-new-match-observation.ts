/** Tracks newly observed Tinder thread links without asserting they are newly
 * created matches. A newly loaded old sidebar row is NOT proof of a new match.
 * Observations are read-only until real Tinder DOM evidence confirms age/status. */
export interface NewMatchObservationState {
  schemaVersion: 1;
  enabled: boolean;
  baselineReady: boolean;
  seenRefs: string[];
  pendingRefs: string[];
  updatedAt: string;
}

export function emptyNewMatchState(): NewMatchObservationState {
  return { schemaVersion: 1, enabled: false, baselineReady: false, seenRefs: [], pendingRefs: [], updatedAt: "" };
}

function clean(refs: readonly string[]): string[] {
  return [...new Set(refs.map(x => x.trim()).filter(x => x.length > 0 && x.length <= 512))].slice(0, 500);
}

export function armNewMatchObservation(refs: readonly string[], now = new Date().toISOString()): NewMatchObservationState {
  return { schemaVersion: 1, enabled: true, baselineReady: true, seenRefs: clean(refs), pendingRefs: [], updatedAt: now };
}

export function stopNewMatchObservation(state: NewMatchObservationState): NewMatchObservationState {
  return { ...state, enabled: false };
}

export function observeNewMatchLinks(state: NewMatchObservationState, refs: readonly string[], now = new Date().toISOString()): NewMatchObservationState {
  if (!state.enabled || !state.baselineReady) return state;
  const current = clean(refs);
  const seen = new Set(state.seenRefs);
  const pending = new Set(state.pendingRefs);
  for (const ref of current) if (!seen.has(ref)) pending.add(ref);
  return {
    ...state,
    seenRefs: clean([...state.seenRefs, ...current]),
    pendingRefs: clean([...pending]),
    updatedAt: now
  };
}

export function isNewMatchObservationState(value: unknown): value is NewMatchObservationState {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<NewMatchObservationState>;
  return v.schemaVersion === 1 && typeof v.enabled === "boolean" && typeof v.baselineReady === "boolean"
    && Array.isArray(v.seenRefs) && v.seenRefs.every(x => typeof x === "string")
    && Array.isArray(v.pendingRefs) && v.pendingRefs.every(x => typeof x === "string")
    && typeof v.updatedAt === "string";
}
