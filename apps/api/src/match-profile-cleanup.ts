import { deleteExpiredTemporaryMatchProfiles } from "./match-profile-service.js";

export type MatchProfileCleanupResult = {
  ran: boolean;
  deleted: number;
  startedAt: string;
  finishedAt: string;
};

export type MatchProfileCleanupHealth = {
  inFlight: boolean;
  lastAttemptAt: string | null;
  lastCompletedAt: string | null;
  lastDeleted: number | null;
};

let lastRunAt = 0;
let inFlight: Promise<MatchProfileCleanupResult> | null = null;
let lastAttemptAt: string | null = null;
let lastCompletedAt: string | null = null;
let lastDeleted: number | null = null;

export function getMatchProfileCleanupHealth(): MatchProfileCleanupHealth {
  return {
    inFlight: inFlight !== null,
    lastAttemptAt,
    lastCompletedAt,
    lastDeleted
  };
}

export function resetMatchProfileCleanupState(): void {
  lastRunAt = 0;
  inFlight = null;
  lastAttemptAt = null;
  lastCompletedAt = null;
  lastDeleted = null;
}

export async function runMatchProfileCleanup(options: {
  now?: Date;
  minIntervalMs?: number;
  deleteExpired?: (now: Date) => Promise<number>;
} = {}): Promise<MatchProfileCleanupResult> {
  const now = options.now ?? new Date();
  const minIntervalMs = Math.max(60_000, options.minIntervalMs ?? 60 * 60 * 1000);
  const deleteExpired = options.deleteExpired ?? deleteExpiredTemporaryMatchProfiles;
  if (inFlight) return inFlight;

  lastAttemptAt = now.toISOString();
  if (lastRunAt && now.getTime() - lastRunAt < minIntervalMs) {
    return { ran: false, deleted: 0, startedAt: now.toISOString(), finishedAt: now.toISOString() };
  }

  lastRunAt = now.getTime();
  inFlight = (async () => {
    const startedAt = now.toISOString();
    const deleted = await deleteExpired(now);
    const finishedAt = new Date().toISOString();
    lastCompletedAt = finishedAt;
    lastDeleted = deleted;
    return { ran: true, deleted, startedAt, finishedAt };
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
