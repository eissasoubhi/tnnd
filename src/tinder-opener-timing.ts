/** Timing within one first-message burst is independent of the reply delay.
 * Legacy TNND profiles default to 3–10 seconds for opener bubbles.
 * Replies to an incoming message continue using the separate 20–60s window.
 */
export const DEFAULT_OPENER_MIN_SECONDS = 3;
export const DEFAULT_OPENER_MAX_SECONDS = 10;

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

/** Unit comes from crypto.getRandomValues in the Tinder content script. */
export function openerDelaySeconds(config: {
  openerDelayMinSeconds?: unknown;
  openerDelayMaxSeconds?: unknown;
}, unit: number): number {
  const [min, max] = openerDelayWindow(config);
  const fraction = Number.isFinite(unit) ? Math.min(1, Math.max(0, unit)) : 0;
  return min + (max - min) * fraction;
}
