import type { ImportedProfile } from "./profile-import";
import type { ConversationOverridesPayload } from "./conversation-overrides-model";

export interface EffectiveConversationConfig {
  values: ConversationOverridesPayload;
  sources: Record<string, "global" | "chat">;
}

const allowedKeys = new Set<keyof ConversationOverridesPayload>([
  "datingGoal", "datingGoalDetails", "disclosureStrategy", "tone", "directness", "flirtLevel",
  "humorLevel", "emojiLevel", "messageLength", "languages", "stage", "specificGoal",
  "persistentInstructions", "preferredWords", "avoidedWords", "automationEnabled"
]);

function globalDefaults(profile: ImportedProfile | null): ConversationOverridesPayload {
  if (!profile) return {};
  const value = profile.conversationDefaults;
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: ConversationOverridesPayload = {};
  for (const [key, item] of Object.entries(source)) {
    if (!allowedKeys.has(key as keyof ConversationOverridesPayload)) continue;
    (result as Record<string, unknown>)[key] = item;
  }
  return result;
}

export function resolveEffectiveConversationConfig(
  profile: ImportedProfile | null,
  overrides: ConversationOverridesPayload
): EffectiveConversationConfig {
  const defaults = globalDefaults(profile);
  const languages = {
    ...(defaults.languages ?? {}),
    ...(overrides.languages ?? {})
  };
  const values: ConversationOverridesPayload = {
    ...defaults,
    ...overrides,
    ...(Object.keys(languages).length ? { languages } : {})
  };
  const sources: Record<string, "global" | "chat"> = {};
  for (const key of Object.keys(values)) {
    if (key === "languages") continue;
    sources[key] = Object.prototype.hasOwnProperty.call(overrides, key) ? "chat" : "global";
  }
  for (const language of ["fr", "darija", "en"] as const) {
    if (languages[language] === undefined) continue;
    sources[`languages.${language}`] = overrides.languages?.[language] !== undefined ? "chat" : "global";
  }
  return { values, sources };
}

export function summarizeEffectiveConversationConfig(config: EffectiveConversationConfig): string {
  const entries = Object.entries(config.values)
    .filter(([key]) => !["persistentInstructions", "preferredWords", "avoidedWords", "datingGoalDetails", "specificGoal"].includes(key))
    .slice(0, 8)
    .map(([key, value]) => {
      if (key === "languages" && value && typeof value === "object") {
        return `languages ${Object.entries(value).map(([lang, weight]) => `${lang}:${weight}`).join("/")}`;
      }
      const source = config.sources[key] ?? "global";
      return `${key}=${String(value)} (${source})`;
    });
  return entries.length ? entries.join(" · ") : "No effective conversation defaults configured yet.";
}
