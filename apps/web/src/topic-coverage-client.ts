import type { AuthSession } from "./auth-client";
import type { TopicInsight } from "../../../src/setup-progress";
const api = (import.meta.env.VITE_TNND_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "http://127.0.0.1:4000";

export async function loadTopicCoverage(session: AuthSession): Promise<TopicInsight[]> {
  const response = await fetch(`${api}/api/v1/profile/topic-coverage`, {
    headers: { authorization: `Bearer ${session.token}` }
  });
  const data = await response.json().catch(() => ({})) as { topics?: TopicInsight[]; error?: string };
  if (!response.ok || !Array.isArray(data.topics)) throw new Error(data.error || "Topic history unavailable");
  return data.topics;
}
export async function updateTopicPreference(session: AuthSession, topic: string, avoid: boolean): Promise<string[]> {
  const response = await fetch(`${api}/api/v1/profile/topic-preferences`, {
    method: "PUT",
    headers: { authorization: `Bearer ${session.token}`, "content-type": "application/json" },
    body: JSON.stringify({ topic, avoid })
  });
  const data = await response.json().catch(() => ({})) as { avoidedTopics?: string[]; error?: string };
  if (!response.ok || !Array.isArray(data.avoidedTopics)) throw new Error(data.error || "Unable to update topic preference");
  return data.avoidedTopics;
}
export function avoidedTopicsFromProfile(profile: unknown): string[] {
  if (!profile || typeof profile !== "object") return [];
  const engine = (profile as { topicEngine?: { avoidedTopics?: unknown } }).topicEngine;
  return Array.isArray(engine?.avoidedTopics) ? engine.avoidedTopics.filter((v): v is string => typeof v === "string") : [];
}
