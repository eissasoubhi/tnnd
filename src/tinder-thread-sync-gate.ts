import type { TinderBoundedReadResult } from "./tinder-bounded-read-handlers";

export interface TinderThreadSyncCandidate {
  threadKeyHash: string;
  latestIncomingKey: string | null;
  messageKeys: string[];
}

export function readTinderThreadSyncCandidate(result: TinderBoundedReadResult): TinderThreadSyncCandidate | null {
  if (!result.completed || result.kind !== "process-thread") return null;
  const observation = result.observation;
  if (observation.hasConversationContext !== true) return null;

  const threadKeyHash = typeof observation.threadKeyHash === "string" ? observation.threadKeyHash.trim() : "";
  if (!threadKeyHash) return null;

  const rawMessageKeys = observation.messageKeys;
  if (!Array.isArray(rawMessageKeys)) return null;
  const messageKeys = rawMessageKeys
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!messageKeys.length) return null;

  const latestIncomingKey = typeof observation.latestIncomingKey === "string" && observation.latestIncomingKey.trim()
    ? observation.latestIncomingKey.trim()
    : null;

  return {
    threadKeyHash,
    latestIncomingKey,
    messageKeys: [...new Set(messageKeys)]
  };
}

export function shouldSyncTinderThreadCandidate(
  candidate: TinderThreadSyncCandidate,
  persistedCursor: string | null
): boolean {
  if (!persistedCursor) return true;
  if (candidate.latestIncomingKey && candidate.latestIncomingKey !== persistedCursor) return true;
  return !candidate.messageKeys.includes(persistedCursor);
}
