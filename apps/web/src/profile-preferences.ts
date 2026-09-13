import type { ImportedProfile } from "./profile-import";

export const datingGoals = [
  "one-night-stand",
  "casual-dating",
  "friends-with-benefits",
  "non-serious-relationship",
  "serious-relationship",
  "friendship",
  "open-to-see",
  "custom"
] as const;

export const disclosureStrategies = ["subtle", "progressive", "clear", "very-direct"] as const;

export interface EditablePreferences {
  datingGoal: string;
  disclosureStrategy: string;
  formality: string;
  emojiFrequency: string;
  abbreviations: string;
  messageLength: string;
  punctuationDensity: string;
  slangLevel: string;
  directness: string;
  questionFrequency: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

export function readEditablePreferences(profile: ImportedProfile): EditablePreferences {
  const datingIntent = objectValue(profile.datingIntent);
  const textingStyle = objectValue(profile.textingStyle);
  return {
    datingGoal: stringValue(datingIntent.defaultGoal, "open-to-see"),
    disclosureStrategy: stringValue(datingIntent.defaultDisclosureStrategy, "progressive"),
    formality: stringValue(textingStyle.formality, "very-casual"),
    emojiFrequency: stringValue(textingStyle.emojiFrequency, "low"),
    abbreviations: stringValue(textingStyle.abbreviations, "medium"),
    messageLength: stringValue(textingStyle.messageLength, "short"),
    punctuationDensity: stringValue(textingStyle.punctuationDensity, "low"),
    slangLevel: stringValue(textingStyle.slangLevel, "medium"),
    directness: stringValue(textingStyle.directness, "balanced"),
    questionFrequency: stringValue(textingStyle.questionFrequency, "medium")
  };
}

export function writeEditablePreferences(profile: ImportedProfile, preferences: EditablePreferences): ImportedProfile {
  const datingIntent = objectValue(profile.datingIntent);
  const textingStyle = objectValue(profile.textingStyle);
  return {
    ...profile,
    datingIntent: {
      ...datingIntent,
      defaultGoal: preferences.datingGoal,
      defaultDisclosureStrategy: preferences.disclosureStrategy,
      needsReview: false
    },
    textingStyle: {
      ...textingStyle,
      formality: preferences.formality,
      emojiFrequency: preferences.emojiFrequency,
      abbreviations: preferences.abbreviations,
      messageLength: preferences.messageLength,
      punctuationDensity: preferences.punctuationDensity,
      slangLevel: preferences.slangLevel,
      directness: preferences.directness,
      questionFrequency: preferences.questionFrequency
    }
  };
}
