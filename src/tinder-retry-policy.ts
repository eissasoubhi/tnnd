export interface TinderRetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export interface TinderRetryDecision {
  retry: boolean;
  attempt: number;
  delayMs: number;
  reason: "retryable" | "attempt-limit" | "not-retryable";
}

export const DEFAULT_TINDER_RETRY_POLICY: TinderRetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 750,
  maxDelayMs: 5_000
};

export function isRetryableTnndSyncStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

export function planTinderRetry(
  attempt: number,
  status: number | null,
  policy: TinderRetryPolicy = DEFAULT_TINDER_RETRY_POLICY
): TinderRetryDecision {
  const normalizedAttempt = Math.max(1, Math.floor(attempt));
  const retryable = status === null || isRetryableTnndSyncStatus(status);

  if (!retryable) {
    return { retry: false, attempt: normalizedAttempt, delayMs: 0, reason: "not-retryable" };
  }
  if (normalizedAttempt >= policy.maxAttempts) {
    return { retry: false, attempt: normalizedAttempt, delayMs: 0, reason: "attempt-limit" };
  }

  const exponential = policy.baseDelayMs * 2 ** (normalizedAttempt - 1);
  return {
    retry: true,
    attempt: normalizedAttempt,
    delayMs: Math.min(policy.maxDelayMs, exponential),
    reason: "retryable"
  };
}
