/** Start/Stop transitions share one service-worker queue. Each transition
 * checks and writes the owners while holding this queue, so two popup Start
 * commands cannot both pass a stale read of the other runner's state.
 */
let tail: Promise<void> = Promise.resolve();

export function withTinderRunnerTransition<T>(job: () => Promise<T>): Promise<T> {
  const result = tail.then(job, job);
  tail = result.then(() => undefined, () => undefined);
  return result;
}

const SWIPE_ARM_PREFIX = "tnnd.smartSwipeLiveArm.v1:";

export async function assertSwipeNotArmed(): Promise<void> {
  const stored = await chrome.storage.local.get(null);
  if (Object.entries(stored).some(([key, value]) =>
    key.startsWith(SWIPE_ARM_PREFIX) &&
    Boolean(value && typeof value === "object" && (value as { armed?: unknown }).armed === true))) {
    throw new Error("Stop Smart Swipe before starting another Tinder runner.");
  }
}
