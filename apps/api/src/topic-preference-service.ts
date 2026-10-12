import { getPool } from "./db-client.js";
import { createDefaultUserProfile, profileSchemaVersion, validateProfileEnvelope } from "./profile-schema.js";

export function normalizeAvoidedTopic(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_topic");
  const name = value.trim().toLocaleLowerCase().replace(/\s+/g, " ");
  if (name.length > 80 || !/^(?:[a-z][a-z0-9-]{1,39}|topic:[\p{L}\p{N} ._'-]{4,48})$/u.test(name)) {
    throw new Error("invalid_topic");
  }
  return name;
}
export function nextAvoidedTopics(before: unknown, topic: string, avoid: boolean): string[] {
  const old = Array.isArray(before) ? before.filter((v): v is string => typeof v === "string") : [];
  const clean = [...new Set(old.map(v => { try { return normalizeAvoidedTopic(v); } catch { return ""; } }).filter(Boolean))];
  const updated = avoid ? [...new Set([...clean, topic])] : clean.filter(v => v !== topic);
  if (updated.length > 50) throw new Error("too_many_avoided_topics");
  return updated;
}
/** One profile per authenticated user, locked during updates to prevent last-write-wins in this endpoint. */
export async function setAvoidedTopic(userId: string, rawTopic: unknown, avoid: unknown): Promise<string[]> {
  if (typeof avoid !== "boolean") throw new Error("invalid_avoid_flag");
  const topic = normalizeAvoidedTopic(rawTopic);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const row = await client.query<{ profile_json: unknown }>(
      "SELECT profile_json FROM user_profiles WHERE user_id = $1 FOR UPDATE", [userId]
    );
    const checked = validateProfileEnvelope(row.rows[0]?.profile_json);
    const profile = checked.ok ? checked.profile : createDefaultUserProfile();
    const topicEngine = profile.topicEngine ?? {};
    const avoidedTopics = nextAvoidedTopics(topicEngine.avoidedTopics, topic, avoid);
    const next = { ...profile, topicEngine: { ...topicEngine, avoidedTopics } };
    await client.query(
      `INSERT INTO user_profiles (user_id, schema_version, profile_json)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (user_id) DO UPDATE SET profile_json = EXCLUDED.profile_json, updated_at = now()`,
      [userId, profileSchemaVersion, JSON.stringify(next)]
    );
    await client.query("COMMIT");
    return avoidedTopics;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
