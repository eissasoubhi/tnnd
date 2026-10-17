import "dotenv/config";
import { closePool } from "./db-client.js";
import { isDirectCommand } from "./command-entry.js";
import { runOutgoingContactBackfill, type OutgoingContactBackfillOptions } from "./outgoing-contact-backfill.js";

export function parseBackfillArguments(argv: readonly string[]): OutgoingContactBackfillOptions {
  let userId = "";
  let afterConversation: string | undefined;
  let maxConversations: number | undefined;
  let apply = false;
  for (const argument of argv) {
    if (argument.startsWith("--user-id=")) userId = argument.slice("--user-id=".length);
    else if (argument.startsWith("--after-conversation=")) afterConversation = argument.slice("--after-conversation=".length);
    else if (argument.startsWith("--max-conversations=")) maxConversations = Number(argument.slice("--max-conversations=".length));
    else if (argument === "--apply") apply = true;
    else if (argument === "--dry-run") apply = false;
    else throw new Error("unknown_backfill_argument");
  }
  if (!userId) throw new Error("user_id_required");
  return { userId, ...(afterConversation ? { afterConversation } : {}),
    ...(maxConversations !== undefined ? { maxConversations } : {}), apply };
}

async function main(): Promise<void> {
  try {
    const report = await runOutgoingContactBackfill(parseBackfillArguments(process.argv.slice(2)));
    console.log(JSON.stringify({ event: "outgoing_contact_backfill_completed", ...report }));
  } catch (error) {
    // Do not echo arguments, messages, phone numbers, account secrets or SQL.
    console.error(JSON.stringify({
      event: "outgoing_contact_backfill_failed",
      code: error instanceof Error ? error.name : "Error"
    }));
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
if (isDirectCommand(import.meta.url)) void main();
