import { closePool } from "./db-client.js";
import { migrateDatabase } from "./migration-runner.js";

async function main(): Promise<void> {
  try {
    const applied = await migrateDatabase();
    console.log(JSON.stringify({
      event: "database_migrations_completed",
      applied,
      count: applied.length
    }));
  } catch (error) {
    console.error(JSON.stringify({
      event: "database_migrations_failed",
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
