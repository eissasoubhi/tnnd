import { validateConversationOverrides, type ConversationOverrides } from "./conversation-overrides.js";
import { getPool } from "./db-client.js";
import { validateProfileEnvelope } from "./profile-schema.js";

export interface GenerationUserProfileContext {
  identity?: Record<string, unknown>;
  datingIntent?: Record<string, unknown>;
  languages?: Record<string, unknown>;
  textingStyle?: Record<string, unknown>;
}

export interface LoadedGenerationProfile {
  defaults: ConversationOverrides;
  userProfile?: GenerationUserProfileContext;
}

function safeConversationDefaults(value: unknown): ConversationOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return validateConversationOverrides(value);
  } catch {
    return {};
  }
}

function compactValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return undefined;
  if (typeof value === "string") return value.trim().slice(0, 500);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => compactValue(entry, depth + 1)).filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 30)
      .map(([key, entry]) => [key, compactValue(entry, depth + 1)])
      .filter(([, entry]) => entry !== undefined)
  );
}

function compactSection(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const compacted = compactValue(value);
  if (!compacted || typeof compacted !== "object" || Array.isArray(compacted)) return undefined;
  return Object.keys(compacted).length ? compacted as Record<string, unknown> : undefined;
}

function stringList(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

export function compactIdentityForGeneration(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!value) return undefined;
  const structured = {
    firstName: typeof value.firstName === "string" ? value.firstName.trim().slice(0, 80) : "",
    age: typeof value.age === "string" ? value.age.trim().slice(0, 20) : "",
    city: typeof value.city === "string" ? value.city.trim().slice(0, 120) : "",
    origin: typeof value.origin === "string" ? value.origin.trim().slice(0, 120) : "",
    occupation: typeof value.occupation === "string" ? value.occupation.trim().slice(0, 160) : "",
    summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 700) : "",
    stableFacts: stringList(value.stableFacts, 12, 180),
    interests: stringList(value.interests, 10, 100),
    lifestyle: stringList(value.lifestyle, 8, 140),
    preferences: stringList(value.preferences, 8, 140),
    personalityTraits: stringList(value.personalityTraits, 8, 100),
    conversationTopics: stringList(value.conversationTopics, 8, 100),
    avoidTopics: stringList(value.avoidTopics, 8, 100)
  };
  if (!structured.summary && typeof value.aboutMe === "string") {
    structured.summary = value.aboutMe.trim().slice(0, 280);
  }
  return Object.fromEntries(Object.entries(structured).filter(([, entry]) => Array.isArray(entry) ? entry.length > 0 : Boolean(entry)));
}

export async function loadGenerationProfile(userId: string): Promise<LoadedGenerationProfile> {
  const result = await getPool().query<{ profile_json: unknown }>(
    "SELECT profile_json FROM user_profiles WHERE user_id = $1 LIMIT 1",
    [userId]
  );
  const rawProfile = result.rows[0]?.profile_json;
  const validated = validateProfileEnvelope(rawProfile);
  if (!validated.ok) return { defaults: {} };
  const profile = validated.profile;
  const userProfile: GenerationUserProfileContext = {
    ...(compactIdentityForGeneration(profile.identity) ? { identity: compactIdentityForGeneration(profile.identity) } : {}),
    ...(compactSection(profile.datingIntent) ? { datingIntent: compactSection(profile.datingIntent) } : {}),
    ...(compactSection(profile.languages) ? { languages: compactSection(profile.languages) } : {}),
    ...(compactSection(profile.textingStyle) ? { textingStyle: compactSection(profile.textingStyle) } : {})
  };
  return {
    defaults: safeConversationDefaults(profile.conversationDefaults),
    ...(Object.keys(userProfile).length ? { userProfile } : {})
  };
}
