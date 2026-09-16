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
    ...(compactSection(profile.identity) ? { identity: compactSection(profile.identity) } : {}),
    ...(compactSection(profile.datingIntent) ? { datingIntent: compactSection(profile.datingIntent) } : {}),
    ...(compactSection(profile.languages) ? { languages: compactSection(profile.languages) } : {}),
    ...(compactSection(profile.textingStyle) ? { textingStyle: compactSection(profile.textingStyle) } : {})
  };
  return {
    defaults: safeConversationDefaults(profile.conversationDefaults),
    ...(Object.keys(userProfile).length ? { userProfile } : {})
  };
}
