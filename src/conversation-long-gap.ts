/** Long-gap conversation restart is a writing hint, never an automatic send
 * permission. Requires a trustworthy authenticated message chronology.
 *
 * When timestamps or the current Tinder turn cannot be verified, do not infer
 * an absence from the app being closed or the date a row was imported.
 */
export const LONG_GAP_REENTRY_MS = 48 * 60 * 60 * 1000;
const FOLLOW_UP_WINDOW_MS = 36 * 60 * 60 * 1000;

export interface DatedChatMessage {
  direction: "incoming" | "outgoing";
  text: string;
  sentAt?: string | null;
  timestampVerified?: boolean;
}
const sameText = (a: string, b: string) =>
  a.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase() ===
  b.normalize("NFKC").replace(/\s+/g, " ").trim().toLocaleLowerCase();
function validDate(value: unknown, nowMs: number): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  // Reject future dates, clock skew beyond 2 minutes and impossible values.
  return Number.isFinite(parsed) && parsed >= Date.UTC(2020,0,1) &&
    parsed <= nowMs + 120_000 ? parsed : null;
}
function isBoundary(text: string): boolean {
  const t = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return /\b(?:ne m.ecris plus|laisse.moi tranquille|arrete de m.ecrire|stop|not interested|don.t (?:text|message|contact) me|leave me alone|pas interessee?)\b/u.test(t);
}
function isSerious(text: string): boolean {
  return /\b(?:urgent|urgence|danger|help me|suicide|hopital|h[oô]pital|d[eé]c[eè]s)\b/iu.test(text);
}
function greetingCheckin(text: string): boolean {
  const plain = text.trim().slice(0, 140);
  return /^(?:salut|bonjour|bonsoir|hey|hello|hi|coucou|salam|slt)\b/iu.test(plain) &&
    /(?:\b(?:c[aç]a va|cv|comment (?:tu vas|[cç]a va)|labas|kidayr|kidayra|how are you|how.s it going|you good)\b|\?)/iu.test(plain);
}
function oldQuestion(text: string): boolean {
  return /[?؟]/u.test(text);
}

/**
 * First turn: a calm greeting + one light check-in, no automatic extra bubble.
 * Second turn: after the match replies, reconnect to a genuinely pending
 * question when appropriate; otherwise follow the new conversation.
 */
export function longGapConversationGuidance(
  messages: readonly DatedChatMessage[],
  latestIncomingText: string | null = null,
  now: Date = new Date()
): string {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs) || messages.length < 2) return "";
  const recent = messages.slice(-40);
  const last = recent.at(-1);
  if (!last || last.direction !== "incoming" || !last.text.trim() ||
      (latestIncomingText !== null && !sameText(last.text, latestIncomingText))) return "";
  if (isBoundary(last.text) || isSerious(last.text)) return "";
  const latestAt = last.timestampVerified === true ? validDate(last.sentAt, nowMs) : null;
  if (latestAt === null) return "";
  // Detect both: (1) nobody has messaged since the incoming turn, and
  // (2) the match has just restarted an otherwise dormant conversation.
  // An unknown prior timestamp cannot prove either long gap safely.
  const prev = recent.at(-2)!;
  const previousAt = prev.timestampVerified === true ? validDate(prev.sentAt, nowMs) : null;
  if (previousAt === null || previousAt > latestAt) return "";
  // Continuation comes FIRST, otherwise a delayed response to a re-entry
  // greeting might be mistaken for yet another gap and get "Salut" again.
  if (recent.length >= 3 && nowMs - latestAt <= FOLLOW_UP_WINDOW_MS) {
    const greeting = recent.at(-2)!;
    const older = recent.at(-3)!;
    const helloAt = greeting.timestampVerified === true ? validDate(greeting.sentAt, nowMs) : null;
    const olderAt = older.timestampVerified === true ? validDate(older.sentAt, nowMs) : null;
    const before = recent.at(-4);
    const beforeAt = before?.timestampVerified === true ? validDate(before.sentAt, nowMs) : null;
    const gapBeforeOlder = beforeAt !== null && olderAt !== null &&
      beforeAt <= olderAt && olderAt - beforeAt >= LONG_GAP_REENTRY_MS;
    if (greeting.direction === "outgoing" && older.direction === "incoming" &&
        helloAt !== null && olderAt !== null && olderAt <= helloAt &&
        helloAt <= latestAt && greetingCheckin(greeting.text) &&
        (helloAt - olderAt >= LONG_GAP_REENTRY_MS || gapBeforeOlder)) {
      return [
        "The match has now replied to your short re-entry check-in after a long pause.",
        oldQuestion(older.text)
          ? "There is an earlier unanswered question from before the pause. If it is still relevant, answer it briefly and naturally after acknowledging the match's NEW message; otherwise let the old topic go. Do not invent the answer or silently ignore important direct questions."
          : "No verified pending old question needs an answer. Respond naturally to the match's new message and start a fresh topic only if the exchange invites it.",
        "Do not greet them again; avoid another generic 'comment ça va', a string of interview questions, or an unrelated filler remark."
      ].join(" ");
    }
  }

  const oldUnanswered = nowMs - latestAt >= LONG_GAP_REENTRY_MS;
  const returnedAfterGap = latestAt - previousAt >= LONG_GAP_REENTRY_MS;
  if (oldUnanswered || returnedAfterGap) {
    return [
      "Long-gap conversation RE-ENTRY (verified: at least 48 hours without an exchange before this turn, or an old incoming message still unanswered after 48 hours). This is NOT a new match opener.",
      "On THIS turn, start with one short, calm greeting and one natural check-in such as 'Salut, ça va ?' or 'Bonsoir, comment tu vas ?' when the time of day is known. Match their language and tone; avoid loud enthusiasm, apologies about the absence, 'tu m'as manqué', or pretending you missed them.",
      "Do not immediately answer an old non-urgent question or revive an old topic in the same turn. After they respond to the check-in, revisit an unanswered question or meaningful topic if still relevant; otherwise start a fresh low-pressure conversation. Send only the one ordinary allowed reply; never chase, double-text or schedule a follow-up.",
      "Explicit boundaries, urgent or safety-related questions, and normal message-send permissions always take precedence. Ordinary non-urgent questions can be revisited after their reaction to the check-in."
    ].join(" ");
  }
  return "";
}
