/** Conversation attention is a scheduling hint, never permission to send.
 * Only bounded timing metadata is kept. No message bodies, profile content,
 * online-status guesses, or Tinder DOM selectors are stored here.
 */
export type ConversationActivitySignal = "opened" | "incoming" | "sent";
export type ConversationActivityStage = "cold" | "reconnecting" | "active" | "very-active";

export interface ConversationActivity {
  ref: string;
  score: number;
  quickReplyStreak: number;
  lastIncomingAt: string | null;
  lastOutgoingAt: string | null;
  lastInteractionAt: string;
}

export interface ConversationAttention {
  score: number;
  stage: ConversationActivityStage;
  waitMs: number;
  reason: string;
}

export interface AdaptiveConversationFollow {
  activeConversationRef: string | null;
  activeConversationUntil: string | null;
  conversationActivities: ConversationActivity[];
}

export const MAX_ADAPTIVE_WAIT_MS = 180_000;
const MAX_TRACKED = 200;
const HALF_LIFE_MS = 8 * 60_000;
const MAX_REPLY_AGE_MS = 10 * 60_000;

function timestamp(input: string | null): number | null {
  const parsed = input ? Date.parse(input) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function validRef(ref: unknown): ref is string {
  return typeof ref === "string" && ref.length > 0 && ref.length <= 512 && !ref.includes("/");
}

function validEntry(value: unknown): value is ConversationActivity {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ConversationActivity>;
  return validRef(item.ref)
    && typeof item.score === "number" && Number.isFinite(item.score) && item.score >= 0 && item.score <= 100
    && typeof item.quickReplyStreak === "number" && Number.isInteger(item.quickReplyStreak) && item.quickReplyStreak >= 0 && item.quickReplyStreak <= 5
    && (item.lastIncomingAt === null || (typeof item.lastIncomingAt === "string" && timestamp(item.lastIncomingAt) !== null))
    && (item.lastOutgoingAt === null || (typeof item.lastOutgoingAt === "string" && timestamp(item.lastOutgoingAt) !== null))
    && typeof item.lastInteractionAt === "string" && timestamp(item.lastInteractionAt) !== null;
}

/** Treat corrupted/replayed storage conservatively, and cap by newest entry. */
export function normalizeConversationActivities(value: unknown): ConversationActivity[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, ConversationActivity>();
  for (const candidate of value) {
    if (validEntry(candidate)) {
      const previous = unique.get(candidate.ref);
      if (!previous || candidate.lastInteractionAt > previous.lastInteractionAt) unique.set(candidate.ref, candidate);
    }
  }
  return [...unique.values()]
    .sort((a, b) => b.lastInteractionAt.localeCompare(a.lastInteractionAt))
    .slice(0, MAX_TRACKED);
}

export function decayedActivityScore(entry: ConversationActivity | undefined, now: number): number {
  if (!entry || !Number.isFinite(now)) return 0;
  const last = timestamp(entry.lastInteractionAt);
  if (last === null) return 0;
  const elapsed = Math.max(0, now - last);
  if (elapsed > 60 * 60_000) return 0;
  return Math.max(0, Math.min(100, Math.round(entry.score * Math.pow(0.5, elapsed / HALF_LIFE_MS))));
}

export function conversationAttention(
  entries: readonly ConversationActivity[],
  ref: string,
  now = Date.now()
): ConversationAttention {
  const entry = entries.find(item => item.ref === ref);
  const score = decayedActivityScore(entry, now);
  if (score < 25) return {
    score, stage: "cold", waitMs: Math.round(2_000 + score / 25 * 3_000),
    reason: "No strong evidence of a live exchange"
  };
  if (score < 50) return {
    score, stage: "reconnecting", waitMs: Math.round(15_000 + (score - 25) / 25 * 30_000),
    reason: "A reply was recently observed"
  };
  if (score < 80) return {
    score, stage: "active", waitMs: Math.round(60_000 + (score - 50) / 30 * 60_000),
    reason: "Recent reciprocal exchange"
  };
  return {
    score, stage: "very-active", waitMs: Math.min(MAX_ADAPTIVE_WAIT_MS,
      Math.round(120_000 + (score - 80) / 20 * 60_000)),
    reason: "Sustained rapid replies"
  };
}

/** Use time since our last *confirmed* send, never since a draft/navigation.
 * Multiple incoming bubbles without an intervening send do not count as
 * multiple rapid back-and-forth exchanges.
 */
export function observeConversationActivity(
  entries: readonly ConversationActivity[],
  ref: string,
  signal: ConversationActivitySignal,
  at = new Date().toISOString()
): ConversationActivity[] {
  const now = timestamp(at);
  if (!validRef(ref) || now === null) return normalizeConversationActivities(entries);
  const previous = entries.find(item => item.ref === ref && validEntry(item));
  if (previous && (timestamp(previous.lastInteractionAt) ?? 0) > now)
    return normalizeConversationActivities(entries); // out-of-order event
  const baseScore = decayedActivityScore(previous, now);
  let score = baseScore;
  let streak = previous?.quickReplyStreak ?? 0;
  let lastIncomingAt = previous?.lastIncomingAt ?? null;
  let lastOutgoingAt = previous?.lastOutgoingAt ?? null;
  if (signal === "incoming") {
    const sentTime = timestamp(lastOutgoingAt);
    const incomingTime = timestamp(lastIncomingAt);
    const replyMs = sentTime === null ? Infinity : now - sentTime;
    const isReplyToOurLastSend = sentTime !== null && replyMs >= 0
      && replyMs <= MAX_REPLY_AGE_MS && (incomingTime === null || sentTime >= incomingTime);
    const quick = isReplyToOurLastSend && replyMs <= 60_000;
    streak = quick ? Math.min(5, streak + 1) : 0;
    const boost = isReplyToOurLastSend
      ? replyMs <= 20_000 ? 40 : replyMs <= 60_000 ? 28
        : replyMs <= 180_000 ? 14 : 7
      : incomingTime !== null && now - incomingTime < 60_000 ? 3 : 18;
    score = Math.min(100, baseScore + boost + (quick ? (streak - 1) * 7 : 0));
    lastIncomingAt = at;
  } else if (signal === "sent") {
    const received = timestamp(lastIncomingAt);
    const sent = timestamp(lastOutgoingAt);
    // Sending another bubble cannot inflate activity; only one reciprocal
    // outgoing event can count for each new incoming turn.
    if (received !== null && (sent === null || received > sent) && now - received <= 120_000)
      score = Math.min(100, baseScore + 8);
    lastOutgoingAt = at;
  }
  const next: ConversationActivity = {
    ref, score, quickReplyStreak: streak, lastIncomingAt, lastOutgoingAt, lastInteractionAt: at
  };
  return normalizeConversationActivities([...entries.filter(item => item.ref !== ref), next]);
}

export function followConversationAfterSignal(
  current: AdaptiveConversationFollow,
  ref: string,
  signal: ConversationActivitySignal,
  at = new Date().toISOString()
): AdaptiveConversationFollow {
  const now = timestamp(at);
  if (now === null || !validRef(ref)) return current;
  const conversationActivities = observeConversationActivity(current.conversationActivities, ref, signal, at);
  const { waitMs } = conversationAttention(conversationActivities, ref, now);
  return {
    conversationActivities,
    activeConversationRef: ref,
    activeConversationUntil: new Date(now + waitMs).toISOString()
  };
}

/** Re-evaluate on every tick: stale scores decrease the remaining lease.
 * Other queues may be observed during focus, but must not steal the tab.
 */
export function shouldKeepConversationInFocus(
  current: AdaptiveConversationFollow,
  tabRef: string | null,
  eligibleRefs: readonly string[],
  now = Date.now()
): boolean {
  if (!tabRef || current.activeConversationRef !== tabRef || !eligibleRefs.includes(tabRef)) return false;
  const expires = timestamp(current.activeConversationUntil);
  const entry = current.conversationActivities.find(item => item.ref === tabRef);
  const interacted = entry ? timestamp(entry.lastInteractionAt) : null;
  if (expires === null || interacted === null || now < interacted) return false;
  const { waitMs } = conversationAttention(current.conversationActivities, tabRef, now);
  return now < Math.min(expires, interacted + waitMs);
}
