import type { PoolClient } from "pg";
import { getPool } from "./db-client.js";

export interface ConversationThreadLockResult<T> {
  acquired: boolean;
  value?: T;
}

function lockIdentity(userId: string, externalThreadId: string): string {
  return `tnnd:conversation-thread:${userId.trim()}:${externalThreadId.trim()}`;
}

export async function tryAcquireConversationThreadLock(
  client: PoolClient,
  userId: string,
  externalThreadId: string
): Promise<boolean> {
  const normalizedUserId = userId.trim();
  const normalizedThreadId = externalThreadId.trim();
  if (!normalizedUserId || !normalizedThreadId) {
    throw new Error("invalid_conversation_thread_lock_identity");
  }

  const result = await client.query<{ acquired: boolean }>(
    "SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired",
    [lockIdentity(normalizedUserId, normalizedThreadId)]
  );
  return result.rows[0]?.acquired === true;
}

export async function withConversationThreadLock<T>(
  userId: string,
  externalThreadId: string,
  work: (client: PoolClient) => Promise<T>
): Promise<ConversationThreadLockResult<T>> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const acquired = await tryAcquireConversationThreadLock(client, userId, externalThreadId);
    if (!acquired) {
      await client.query("ROLLBACK");
      return { acquired: false };
    }

    const value = await work(client);
    await client.query("COMMIT");
    return { acquired: true, value };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original failure; the connection is released below.
    }
    throw error;
  } finally {
    client.release();
  }
}
