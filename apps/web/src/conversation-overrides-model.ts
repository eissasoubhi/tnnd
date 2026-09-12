export const overrideDatingGoals = [
  "one-night-stand",
  "casual-dating",
  "friends-with-benefits",
  "non-serious-relationship",
  "serious-relationship",
  "friendship",
  "open-to-see",
  "custom"
] as const;

export const overrideDisclosureStrategies = ["subtle", "progressive", "clear", "very-direct"] as const;
export const overrideTones = ["playful", "flirty", "direct", "warm", "chill", "witty"] as const;
export const overrideMessageLengths = ["very-short", "short", "medium"] as const;
export const overrideEmojiLevels = ["none", "low", "medium"] as const;
export const overrideStages = ["auto", "opener", "discovery", "playful", "date-prep", "off-app", "re-engagement"] as const;

export type OverrideDatingGoal = typeof overrideDatingGoals[number];
export type OverrideDisclosureStrategy = typeof overrideDisclosureStrategies[number];
export type OverrideTone = typeof overrideTones[number];
export type OverrideMessageLength = typeof overrideMessageLengths[number];
export type OverrideEmojiLevel = typeof overrideEmojiLevels[number];
export type OverrideStage = typeof overrideStages[number];

export interface ConversationOverridesPayload {
  datingGoal?: OverrideDatingGoal;
  datingGoalDetails?: string;
  disclosureStrategy?: OverrideDisclosureStrategy;
  tone?: OverrideTone;
  directness?: number;
  flirtLevel?: number;
  humorLevel?: number;
  emojiLevel?: OverrideEmojiLevel;
  messageLength?: OverrideMessageLength;
  languages?: Partial<{ fr: number; darija: number; en: number }>;
  stage?: OverrideStage;
  specificGoal?: string;
  persistentInstructions?: string;
  preferredWords?: string;
  avoidedWords?: string;
  automationEnabled?: boolean;
}

export interface ConversationOverrideDraft {
  datingGoal?: string;
  datingGoalDetails?: string;
  disclosureStrategy?: string;
  tone?: string;
  directness?: string;
  flirtLevel?: string;
  humorLevel?: string;
  emojiLevel?: string;
  messageLength?: string;
  languageFr?: string;
  languageDarija?: string;
  languageEn?: string;
  stage?: string;
  specificGoal?: string;
  persistentInstructions?: string;
  preferredWords?: string;
  avoidedWords?: string;
  automationEnabled?: boolean;
}

function optionalEnum<T extends string>(value: string | undefined, values: readonly T[]): T | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!values.includes(normalized as T)) throw new Error(`Invalid override value: ${normalized}`);
  return normalized as T;
}

function optionalString(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length > maxLength) throw new Error(`Override text exceeds ${maxLength} characters.`);
  return normalized;
}

function optionalNumber(value: string | undefined, min: number, max: number): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const number = Number(normalized);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw new Error(`Override number must be between ${min} and ${max}.`);
  }
  return number;
}

export function buildConversationOverridesPayload(draft: ConversationOverrideDraft): ConversationOverridesPayload {
  const fr = optionalNumber(draft.languageFr, 0, 100);
  const darija = optionalNumber(draft.languageDarija, 0, 100);
  const en = optionalNumber(draft.languageEn, 0, 100);
  const languages = fr === undefined && darija === undefined && en === undefined
    ? undefined
    : {
      ...(fr === undefined ? {} : { fr }),
      ...(darija === undefined ? {} : { darija }),
      ...(en === undefined ? {} : { en })
    };

  return {
    ...(optionalEnum(draft.datingGoal, overrideDatingGoals) ? { datingGoal: optionalEnum(draft.datingGoal, overrideDatingGoals) } : {}),
    ...(optionalString(draft.datingGoalDetails, 500) ? { datingGoalDetails: optionalString(draft.datingGoalDetails, 500) } : {}),
    ...(optionalEnum(draft.disclosureStrategy, overrideDisclosureStrategies) ? { disclosureStrategy: optionalEnum(draft.disclosureStrategy, overrideDisclosureStrategies) } : {}),
    ...(optionalEnum(draft.tone, overrideTones) ? { tone: optionalEnum(draft.tone, overrideTones) } : {}),
    ...(optionalNumber(draft.directness, 0, 100) !== undefined ? { directness: optionalNumber(draft.directness, 0, 100) } : {}),
    ...(optionalNumber(draft.flirtLevel, 0, 3) !== undefined ? { flirtLevel: optionalNumber(draft.flirtLevel, 0, 3) } : {}),
    ...(optionalNumber(draft.humorLevel, 0, 100) !== undefined ? { humorLevel: optionalNumber(draft.humorLevel, 0, 100) } : {}),
    ...(optionalEnum(draft.emojiLevel, overrideEmojiLevels) ? { emojiLevel: optionalEnum(draft.emojiLevel, overrideEmojiLevels) } : {}),
    ...(optionalEnum(draft.messageLength, overrideMessageLengths) ? { messageLength: optionalEnum(draft.messageLength, overrideMessageLengths) } : {}),
    ...(languages ? { languages } : {}),
    ...(optionalEnum(draft.stage, overrideStages) ? { stage: optionalEnum(draft.stage, overrideStages) } : {}),
    ...(optionalString(draft.specificGoal, 500) ? { specificGoal: optionalString(draft.specificGoal, 500) } : {}),
    ...(optionalString(draft.persistentInstructions, 2000) ? { persistentInstructions: optionalString(draft.persistentInstructions, 2000) } : {}),
    ...(optionalString(draft.preferredWords, 1000) ? { preferredWords: optionalString(draft.preferredWords, 1000) } : {}),
    ...(optionalString(draft.avoidedWords, 1000) ? { avoidedWords: optionalString(draft.avoidedWords, 1000) } : {}),
    ...(draft.automationEnabled === undefined ? {} : { automationEnabled: draft.automationEnabled })
  };
}

export function summarizeConversationOverrides(overrides: ConversationOverridesPayload): string[] {
  const summary: string[] = [];
  if (overrides.datingGoal) summary.push(`goal: ${overrides.datingGoal}`);
  if (overrides.disclosureStrategy) summary.push(`disclosure: ${overrides.disclosureStrategy}`);
  if (overrides.tone) summary.push(`tone: ${overrides.tone}`);
  if (overrides.stage) summary.push(`stage: ${overrides.stage}`);
  if (overrides.automationEnabled !== undefined) summary.push(`automation: ${overrides.automationEnabled ? "on" : "off"}`);
  if (overrides.languages && Object.keys(overrides.languages).length) summary.push("language mix overridden");
  if (overrides.persistentInstructions) summary.push("persistent instruction");
  return summary;
}
