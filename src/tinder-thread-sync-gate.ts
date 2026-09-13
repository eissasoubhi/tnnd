import type { TinderBoundedReadResult } from "./tinder-bounded-read-handlers";
import {
  mayAiTakeOverTinderConversation,
  type TinderConversationManagement
} from "./tinder-ai-takeover-policy";

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

export function readAiManagedTinderThreadSyncCandidate(
  result: TinderBoundedReadResult,
  management: Partial<TinderConversationManagement> | null | undefined
): TinderThreadSyncCandidate | null {
  if (!mayAiTakeOverTinderConversation(management)) return null;
  return readTinderThreadSyncCandidate(result);
}

export function shouldSyncTinderThreadCandidate(
  candidate: TinderThreadSyncCandidate,
  persistedCursor: string | null
): boolean {
  if (!persistedCursor) return true;
  if (candidate.latestIncomingKey && candidate.latestIncomingKey !== persistedCursor) return true;
  return !candidate.messageKeys.includes(persistedCursor);
}

export function shouldSyncAiManagedTinderThreadCandidate(
  candidate: TinderThreadSyncCandidate,
  persistedCursor: string | null,
  management: Partial<TinderConversationManagement> | null | undefined
): boolean {
  return mayAiTakeOverTinderConversation(management)
    && shouldSyncTinderThreadCandidate(candidate, persistedCursor);
}
