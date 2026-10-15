/** A hung Tinder SPA message receiver must never leave the runner in
 * "Opening chat" for minutes (or allow overlapping navigation attempts).
 * A timeout pauses automation; it does not retry or claim a send.
 */
export const SPA_NAVIGATION_TIMEOUT_MS = 12_000;
export const STALE_OPENING_TIMEOUT_MS = 20_000;
export class SpaNavigationTimeoutError extends Error {
  constructor() {
    super("Tinder chat opening timed out after 12 seconds. Runner paused; check Tinder and reload the extension if needed. No message was sent or retried.");
    this.name = "SpaNavigationTimeoutError";
  }
}
export function withSpaNavigationTimeout<T>(
  operation: Promise<T>,
  timeoutMs = SPA_NAVIGATION_TIMEOUT_MS
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SpaNavigationTimeoutError()), timeoutMs);
    void operation.then(
      result => { clearTimeout(timer); resolve(result); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}
export function isStalledOpening(
  phase: string,
  actionAt: string | null,
  now = Date.now()
): boolean {
  if (phase !== "loading" || !actionAt) return false;
  const last = Date.parse(actionAt);
  return Number.isFinite(last) && now - last >= STALE_OPENING_TIMEOUT_MS;
}
