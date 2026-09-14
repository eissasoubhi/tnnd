import { closePool } from "./db-client.js";
import { runMatchProfileCleanup } from "./match-profile-cleanup.js";

export function cleanupLogPayload(result: {
  ran: boolean;
  deleted: number;
  startedAt: string;
  finishedAt: string;
}) {
  return {
    event: result.ran ? "match_profile_cleanup_completed" : "match_profile_cleanup_skipped",
    deleted: result.deleted,
    startedAt: result.startedAt,
    finishedAt: result.finishedAt
  };
}

async function main(): Promise<void> {
  try {
    const result = await runMatchProfileCleanup({ minIntervalMs: 60_000 });
    console.log(JSON.stringify(cleanupLogPayload(result)));
  } catch (error) {
    console.error(JSON.stringify({
      event: "match_profile_cleanup_failed",
      error: error instanceof Error ? error.name : "UnknownError"
    }));
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
