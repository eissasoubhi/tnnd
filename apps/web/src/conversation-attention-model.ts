/** Read-only presentation of local extension observations for the Web panel.
 * No guessed online status or derived Tinder messages.
 */
export interface AttentionObservation {
  ref: string;
  score: number;
  quickReplyStreak: number;
  lastIncomingAt: string | null;
  lastOutgoingAt: string | null;
  lastInteractionAt: string;
}
export interface AttentionWireState {
  capSeconds: number;
  watcherActive: boolean;
  activeConversationRef: string | null;
  activeConversationUntil: string | null;
  observed: AttentionObservation[];
}
export interface AttentionDisplayRow {
  ref: string;
  name: string;
  score: number | null;
  stage: "cold" | "reconnecting" | "active" | "very-active" | "not-observed";
  waitSeconds: number | null;
  remainingSeconds: number | null;
  lastObservedAt: string | null;
}

export const ATTENTION_CAP_CHOICES = [30, 60, 90, 120, 180, 240, 300, 420, 600] as const;
export function validCap(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 30 && value <= 600
    && value % 15 === 0;
}
const validTime = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));
const validRef = (ref: unknown): ref is string =>
  typeof ref === "string" && ref.length > 0 && ref.length <= 512 && !ref.includes("/");
export function parseAttentionState(value: unknown): AttentionWireState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Partial<AttentionWireState>;
  if (!validCap(v.capSeconds) || typeof v.watcherActive !== "boolean"
    || !Array.isArray(v.observed) || v.observed.length > 200) return null;
  const observed = v.observed.filter((o): o is AttentionObservation =>
    !!o && validRef(o.ref) && typeof o.score === "number" && Number.isFinite(o.score)
      && o.score >= 0 && o.score <= 100 && validTime(o.lastInteractionAt)
      && (o.lastIncomingAt === null || validTime(o.lastIncomingAt))
      && (o.lastOutgoingAt === null || validTime(o.lastOutgoingAt))
      && Number.isInteger(o.quickReplyStreak) && o.quickReplyStreak >= 0 && o.quickReplyStreak <= 5);
  return { capSeconds: v.capSeconds, watcherActive: v.watcherActive,
    activeConversationRef: validRef(v.activeConversationRef) ? v.activeConversationRef : null,
    activeConversationUntil: validTime(v.activeConversationUntil) ? v.activeConversationUntil : null,
    observed: v.watcherActive ? observed : [] };
}

function attentionAt(entry: AttentionObservation, now: number): {score: number; stage: AttentionDisplayRow["stage"]; waitMs: number} {
  const elapsed = Math.max(0, now - Date.parse(entry.lastInteractionAt));
  const score = elapsed > 60 * 60_000 ? 0 : Math.max(0, Math.min(100,
    Math.round(entry.score * Math.pow(0.5, elapsed / (8 * 60_000)))));
  if (score < 25) return { score, stage: "cold", waitMs: Math.round(2000 + score / 25 * 3000) };
  if (score < 50) return { score, stage: "reconnecting", waitMs: Math.round(15000 + (score - 25) / 25 * 30000) };
  if (score < 80) return { score, stage: "active", waitMs: Math.round(60000 + (score - 50) / 30 * 60000) };
  return { score, stage: "very-active", waitMs: Math.min(180000,
    Math.round(120000 + (score - 80) / 20 * 60000)) };
}
export function effectiveAttentionWaitMs(baseWaitMs: number, score: number, capSeconds: number): number {
  const capMs = (validCap(capSeconds) ? capSeconds : 180) * 1000;
  const scaled = capMs > 180000 && score >= 25
    ? Math.round(baseWaitMs * capMs / 180000) : baseWaitMs;
  return Math.min(capMs, Math.max(0, Math.round(scaled)));
}

export function buildAttentionRows(
  state: AttentionWireState | null,
  names: ReadonlyMap<string, string>,
  now = Date.now()
): AttentionDisplayRow[] {
  if (!state) return [];
  const byRef = new Map(state.observed.map(entry => [entry.ref, entry]));
  // Show only threads known to this authenticated Web user's own backend;
  // never expose another user's extension activity by raw Tinder ref.
  return [...names].map(([ref, name]) => {
    const entry = byRef.get(ref);
    if (!entry || !state.watcherActive) return { ref, name, score: null,
      stage: "not-observed" as const, waitSeconds: null, remainingSeconds: null, lastObservedAt: null };
    const a = attentionAt(entry, now);
    const waitMs = effectiveAttentionWaitMs(a.waitMs, a.score, state.capSeconds);
    const active = state.activeConversationRef === ref
      && state.activeConversationUntil && Number.isFinite(Date.parse(state.activeConversationUntil));
    const remaining = active ? Math.max(0, Math.min(Date.parse(state.activeConversationUntil!),
      Date.parse(entry.lastInteractionAt) + waitMs) - now) : 0;
    return { ref, name, score: a.score, stage: a.stage,
      waitSeconds: Math.round(waitMs / 1000), remainingSeconds: active ? Math.ceil(remaining / 1000) : null,
      lastObservedAt: entry.lastInteractionAt };
  }).sort((a, b) => (b.score === null ? -1 : b.score) - (a.score === null ? -1 : a.score)
    || a.name.localeCompare(b.name)).slice(0, 200);
}
