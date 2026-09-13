import type { TinderUnreadThreadCandidate } from "./tinder-unread-queue";

export type TinderUnreadObservationStatus = "pending" | "completed-visible";

export interface TinderUnreadObservationEntry {
  conversationRef: string;
  signal: TinderUnreadThreadCandidate["signal"];
  status: TinderUnreadObservationStatus;
  lastSeenAt: string;
}

export interface TinderUnreadObservationState {
  schemaVersion: 1;
  entries: TinderUnreadObservationEntry[];
  updatedAt: string;
}

export function reconcileUnreadObservations(
  previous: TinderUnreadObservationState | null,
  candidates: readonly TinderUnreadThreadCandidate[],
  now = new Date().toISOString()
): TinderUnreadObservationState {
  const previousByRef = new Map((previous?.entries ?? []).map((entry) => [entry.conversationRef, entry]));
  const seen = new Set<string>();
  const entries: TinderUnreadObservationEntry[] = [];

  for (const candidate of candidates) {
    if (seen.has(candidate.conversationRef)) continue;
    seen.add(candidate.conversationRef);
    const prior = previousByRef.get(candidate.conversationRef);
    entries.push({
      conversationRef: candidate.conversationRef,
      signal: candidate.signal,
      status: prior?.status === "completed-visible" ? "completed-visible" : "pending",
      lastSeenAt: now
    });
  }

  return { schemaVersion: 1, entries: entries.slice(0, 50), updatedAt: now };
}

export function markUnreadObservationCompleted(
  state: TinderUnreadObservationState,
  conversationRef: string,
  now = new Date().toISOString()
): TinderUnreadObservationState {
  const ref = conversationRef.trim();
  return {
    schemaVersion: 1,
    entries: state.entries.map((entry) => entry.conversationRef === ref
      ? { ...entry, status: "completed-visible", lastSeenAt: now }
      : entry),
    updatedAt: now
  };
}

export function pendingUnreadConversationRefs(state: TinderUnreadObservationState | null): string[] {
  return (state?.entries ?? [])
    .filter((entry) => entry.status === "pending")
    .map((entry) => entry.conversationRef);
}

export function isUnreadObservationState(value: unknown): value is TinderUnreadObservationState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<TinderUnreadObservationState>;
  return state.schemaVersion === 1
    && Array.isArray(state.entries)
    && typeof state.updatedAt === "string"
    && state.entries.every((entry) => Boolean(entry)
      && typeof entry.conversationRef === "string"
      && ["aria", "testid", "class", "badge"].includes(String(entry.signal))
      && ["pending", "completed-visible"].includes(String(entry.status))
      && typeof entry.lastSeenAt === "string");
}
