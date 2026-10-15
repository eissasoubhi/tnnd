/** User-specific cap for adaptive chat focus, not an AI reply delay.
 * It never grants permission to send or changes Tinder timing controls.
 */
export const DEFAULT_ATTENTION_CAP_SECONDS = 180;
export const MIN_ATTENTION_CAP_SECONDS = 30;
export const MAX_ATTENTION_CAP_SECONDS = 600;

export function validAttentionCapSeconds(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value)
    && value >= MIN_ATTENTION_CAP_SECONDS && value <= MAX_ATTENTION_CAP_SECONDS
    && value % 15 === 0;
}

export function normalizeAttentionCapSeconds(value: unknown): number {
  return validAttentionCapSeconds(value) ? value : DEFAULT_ATTENTION_CAP_SECONDS;
}

export function cappedAttentionWaitMs(baseWaitMs: number, score: number, capSeconds: number): number {
  const cap = normalizeAttentionCapSeconds(capSeconds) * 1000;
  if (!Number.isFinite(baseWaitMs) || baseWaitMs < 0) return 0;
  // Cold chats remain brief regardless of the chosen cap. Higher caps
  // proportionally expand warmer engagement windows, rather than imposing
  // an artificial new minimum. Lower caps only shorten the focus.
  const scaled = cap > DEFAULT_ATTENTION_CAP_SECONDS * 1000 && score >= 25
    ? Math.round(baseWaitMs * cap / (DEFAULT_ATTENTION_CAP_SECONDS * 1000))
    : baseWaitMs;
  return Math.max(0, Math.min(cap, Math.round(scaled)));
}
