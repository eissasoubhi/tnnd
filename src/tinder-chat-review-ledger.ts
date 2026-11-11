/** Cache for verified AI decisions that intentionally DID NOT send a message.
 * Unlike the irreversible processed/send-attempt ledger, review entries can
 * be re-evaluated if the visible conversational context actually changes.
 * No message text, prompt, Tinder ID or personal information is persisted.
 */
export const reviewOutcomes = [
  "acknowledgement", "rest", "off-tinder", "do-not-contact",
  "ai-identity", "manual-review"
] as const;
export type ReviewOutcome = typeof reviewOutcomes[number];
export type ReviewedTurn = {
  contextHash: string;
  outcome: ReviewOutcome;
  at: number;
};

export function visibleContextFingerprint(context: string): string {
  // Stable over DOM scans of the same text; different older history can
  // change the result without altering the last incoming message key.
  let hash = 2166136261;
  for (let i = 0; i < context.length; i++) {
    hash ^= context.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function wasReviewedWithoutSend(
  review: ReviewedTurn | undefined,
  context: string
): boolean {
  return review?.contextHash === visibleContextFingerprint(context);
}

export function normalizeReviewedTurns(value: unknown): Record<string, ReviewedTurn> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set<string>(reviewOutcomes);
  const entries: Array<[string, ReviewedTurn]> = [];
  for (const [key, raw] of Object.entries(value)) {
    if (!key || key.length > 160 || !raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    if (typeof record.contextHash !== "string" || !/^[a-z0-9]{1,16}$/.test(record.contextHash) ||
        typeof record.outcome !== "string" || !allowed.has(record.outcome) ||
        typeof record.at !== "number" || !Number.isFinite(record.at) || record.at <= 0) continue;
    entries.push([key, { contextHash: record.contextHash, outcome: record.outcome as ReviewOutcome, at: record.at }]);
  }
  return Object.fromEntries(entries.slice(-5000));
}
