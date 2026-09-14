import { deleteExpiredTemporaryMatchProfiles } from "./match-profile-service.js";

export type MatchProfileCleanupResult = {
  ran: boolean;
  deleted: number;
  startedAt: string;
  finishedAt: string;
};

let lastRunAt = 0;
let inFlight: Promise<MatchProfileCleanupResult> | null = null;

export function resetMatchProfileCleanupState(): void {
  lastRunAt = 0;
  inFlight = null;
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
  if (lastRunAt && now.getTime() - lastRunAt < minIntervalMs) {
    return { ran: false, deleted: 0, startedAt: now.toISOString(), finishedAt: now.toISOString() };
  }

  lastRunAt = now.getTime();
  inFlight = (async () => {
    const startedAt = now.toISOString();
    const deleted = await deleteExpired(now);
    return { ran: true, deleted, startedAt, finishedAt: new Date().toISOString() };
  })();
  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}
