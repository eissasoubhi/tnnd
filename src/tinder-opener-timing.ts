/** Opening bubbles and incoming replies have INDEPENDENT timing policies.
 * The opener interval estimates how long writing the NEXT bubble takes.
 * Existing saved min/max values are interpreted as a reference pace for a
 * 60-character bubble, not a hard minimum imposed on one-word messages.
 */
export const DEFAULT_OPENER_MIN_SECONDS = 8;
export const DEFAULT_OPENER_MAX_SECONDS = 15;
export const OPENER_REFERENCE_CHARACTERS = 60;
export const OPENER_MIN_REALISTIC_REFERENCE_SECONDS = 8;
export const OPENER_MAX_TYPING_GAP_SECONDS = 150;

function boundedSeconds(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value)
    && value >= 1 && value <= 60 ? value : fallback;
}

export function openerDelayWindow(config: {
  openerDelayMinSeconds?: unknown;
  openerDelayMaxSeconds?: unknown;
}): readonly [number, number] {
  const min = boundedSeconds(config.openerDelayMinSeconds, DEFAULT_OPENER_MIN_SECONDS);
  const max = boundedSeconds(config.openerDelayMaxSeconds, DEFAULT_OPENER_MAX_SECONDS);
  return [Math.min(min, max), Math.max(min, max)];
}

/** A 60-character sentence cannot reasonably be written in 1–3 seconds.
 * Old profiles (including the 3–10s legacy default) keep loading safely but
 * receive a realistic minimum pace instead of suddenly slowing short bubbles.
 */
export function openerTypingReferenceWindow(config: {
  openerDelayMinSeconds?: unknown;
  openerDelayMaxSeconds?: unknown;
}): readonly [number, number] {
  const [minimum, maximum] = openerDelayWindow(config);
  return [Math.max(OPENER_MIN_REALISTIC_REFERENCE_SECONDS, minimum),
    Math.max(OPENER_MIN_REALISTIC_REFERENCE_SECONDS, maximum)];
}

/** Unit comes from crypto.getRandomValues in the Tinder content script.
 * Preserved for multi-part replies which have their own separate 3–10s
 * window, and for callers that need a plain fixed-duration jitter.
 */
export function openerDelaySeconds(config: {
  openerDelayMinSeconds?: unknown;
  openerDelayMaxSeconds?: unknown;
}, unit: number): number {
  const [min, max] = openerDelayWindow(config);
  const fraction = Number.isFinite(unit) ? Math.min(1, Math.max(0, unit)) : 0;
  return min + (max - min) * fraction;
}

/** Estimate a human writing the NEXT opener bubble, not the previous one.
 * Character count includes spaces and punctuation. Use code points to avoid
 * over-counting supplementary Unicode symbols; normalize excess whitespace.
 *
 * A two-word bubble takes roughly 1–3s, whereas a 60-character sentence uses
 * the configured 8–15s reference pace by default. A short minimum of 1s avoids
 * invisible or instantaneous sequential Sends. The 150s fail-safe prevents
 * pathological waits; it does not bypass sending permissions or reply checks.
 */
export function openerTypingDelaySeconds(
  nextBubble: string,
  config: { openerDelayMinSeconds?: unknown; openerDelayMaxSeconds?: unknown },
  unit: number
): number {
  const [min, max] = openerTypingReferenceWindow(config);
  const fraction = Number.isFinite(unit) ? Math.max(0, Math.min(1, unit)) : 0;
  const characters = Array.from(nextBubble.replace(/\s+/gu, " ").trim()).length;
  const referenceSeconds = min + (max - min) * fraction;
  const seconds = 0.35 + Math.max(1, characters) / OPENER_REFERENCE_CHARACTERS * referenceSeconds;
  return Math.round(Math.min(OPENER_MAX_TYPING_GAP_SECONDS, Math.max(1, seconds)) * 10) / 10;
}
