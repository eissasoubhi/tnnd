export type ConversationOverrideTone = "playful" | "flirty" | "direct" | "warm" | "chill" | "witty";
export type ConversationOverrideMessageLength = "very-short" | "short" | "medium";
export type ConversationOverrideEmojiLevel = "none" | "low" | "medium";
export type ConversationOverrideStage = "auto" | "opener" | "discovery" | "playful" | "date-prep" | "off-app" | "re-engagement";
export type DisclosureStrategy = "subtle" | "progressive" | "clear" | "very-direct";
export type DatingGoal = "one-night-stand" | "casual-dating" | "friends-with-benefits" | "non-serious-relationship" | "serious-relationship" | "friendship" | "open-to-see" | "custom";

export interface ConversationOverrides {
  datingGoal?: DatingGoal;
  datingGoalDetails?: string;
  disclosureStrategy?: DisclosureStrategy;
  tone?: ConversationOverrideTone;
  directness?: number;
  flirtLevel?: number;
  humorLevel?: number;
  emojiLevel?: ConversationOverrideEmojiLevel;
  messageLength?: ConversationOverrideMessageLength;
  languages?: Partial<{ fr: number; darija: number; en: number }>;
  stage?: ConversationOverrideStage;
  specificGoal?: string;
  persistentInstructions?: string;
  preferredWords?: string;
  avoidedWords?: string;
  automationEnabled?: boolean;
}

const datingGoals = new Set<DatingGoal>([
  "one-night-stand", "casual-dating", "friends-with-benefits", "non-serious-relationship",
  "serious-relationship", "friendship", "open-to-see", "custom"
]);
const disclosureStrategies = new Set<DisclosureStrategy>(["subtle", "progressive", "clear", "very-direct"]);
const tones = new Set<ConversationOverrideTone>(["playful", "flirty", "direct", "warm", "chill", "witty"]);
const messageLengths = new Set<ConversationOverrideMessageLength>(["very-short", "short", "medium"]);
const emojiLevels = new Set<ConversationOverrideEmojiLevel>(["none", "low", "medium"]);
const stages = new Set<ConversationOverrideStage>(["auto", "opener", "discovery", "playful", "date-prep", "off-app", "re-engagement"]);
const allowedKeys = new Set<keyof ConversationOverrides>([
  "datingGoal", "datingGoalDetails", "disclosureStrategy", "tone", "directness", "flirtLevel", "humorLevel",
  "emojiLevel", "messageLength", "languages", "stage", "specificGoal", "persistentInstructions", "preferredWords",
  "avoidedWords", "automationEnabled"
]);

function boundedString(value: unknown, max: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new Error("invalid_string");
  const result = value.trim();
  if (result.length > max) throw new Error("string_too_long");
  return result;
}

function boundedNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error("invalid_number");
  return value;
}

function enumValue<T extends string>(value: unknown, values: Set<T>): T | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !values.has(value as T)) throw new Error("invalid_enum");
  return value as T;
}

function languageWeights(value: unknown): ConversationOverrides["languages"] {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_languages");
  const source = value as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!new Set(["fr", "darija", "en"]).has(key)) throw new Error("unknown_language_key");
  }
  const result: NonNullable<ConversationOverrides["languages"]> = {};
  for (const key of ["fr", "darija", "en"] as const) {
    const weight = boundedNumber(source[key], 0, 100);
    if (weight !== undefined) result[key] = weight;
  }
  return result;
}

export function validateConversationOverrides(value: unknown): ConversationOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_conversation_overrides");
  const source = value as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!allowedKeys.has(key as keyof ConversationOverrides)) throw new Error(`unknown_override:${key}`);
  }

  const automationEnabled = source.automationEnabled;
  if (automationEnabled !== undefined && typeof automationEnabled !== "boolean") throw new Error("invalid_automation_enabled");

  return {
    ...(enumValue(source.datingGoal, datingGoals) ? { datingGoal: enumValue(source.datingGoal, datingGoals) } : {}),
    ...(boundedString(source.datingGoalDetails, 500) !== undefined ? { datingGoalDetails: boundedString(source.datingGoalDetails, 500) } : {}),
    ...(enumValue(source.disclosureStrategy, disclosureStrategies) ? { disclosureStrategy: enumValue(source.disclosureStrategy, disclosureStrategies) } : {}),
    ...(enumValue(source.tone, tones) ? { tone: enumValue(source.tone, tones) } : {}),
    ...(boundedNumber(source.directness, 0, 100) !== undefined ? { directness: boundedNumber(source.directness, 0, 100) } : {}),
    ...(boundedNumber(source.flirtLevel, 0, 3) !== undefined ? { flirtLevel: boundedNumber(source.flirtLevel, 0, 3) } : {}),
    ...(boundedNumber(source.humorLevel, 0, 100) !== undefined ? { humorLevel: boundedNumber(source.humorLevel, 0, 100) } : {}),
    ...(enumValue(source.emojiLevel, emojiLevels) ? { emojiLevel: enumValue(source.emojiLevel, emojiLevels) } : {}),
    ...(enumValue(source.messageLength, messageLengths) ? { messageLength: enumValue(source.messageLength, messageLengths) } : {}),
    ...(source.languages !== undefined ? { languages: languageWeights(source.languages) } : {}),
    ...(enumValue(source.stage, stages) ? { stage: enumValue(source.stage, stages) } : {}),
    ...(boundedString(source.specificGoal, 500) !== undefined ? { specificGoal: boundedString(source.specificGoal, 500) } : {}),
    ...(boundedString(source.persistentInstructions, 2000) !== undefined ? { persistentInstructions: boundedString(source.persistentInstructions, 2000) } : {}),
    ...(boundedString(source.preferredWords, 1000) !== undefined ? { preferredWords: boundedString(source.preferredWords, 1000) } : {}),
    ...(boundedString(source.avoidedWords, 1000) !== undefined ? { avoidedWords: boundedString(source.avoidedWords, 1000) } : {}),
    ...(automationEnabled !== undefined ? { automationEnabled } : {})
  };
}
