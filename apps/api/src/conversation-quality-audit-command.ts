import "dotenv/config";
import { closePool } from "./db-client.js";
import { isDirectCommand } from "./command-entry.js";
import { runConversationQualityAudit } from "./conversation-quality-audit.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseQualityAuditArgs(args: readonly string[]): { userId: string; quiet: boolean } {
  let userId = "", quiet = false;
  for (const arg of args) {
    if (arg.startsWith("--user-id=")) userId = arg.slice(10).trim();
    else if (arg === "--quiet") quiet = true;
    else throw new Error("invalid_audit_argument");
  }
  if (!UUID.test(userId)) throw new Error("invalid_audit_user_id");
  return { userId, quiet };
}
async function main(): Promise<void> {
  try {
    const args = parseQualityAuditArgs(process.argv.slice(2));
    const report = await runConversationQualityAudit(args.userId);
    console.log(JSON.stringify(args.quiet
      ? { event: "quality_audit_completed", success: true }
      : { event: "quality_audit_completed", report }));
  } catch {
    console.error(JSON.stringify({ event: "quality_audit_failed" }));
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}
if (isDirectCommand(import.meta.url)) void main();
