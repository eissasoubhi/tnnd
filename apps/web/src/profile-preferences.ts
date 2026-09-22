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
  datingGoalDetails?: string;
  disclosureStrategy: string;
  formality: string;
  capitalization: string;
  emojiFrequency: string;
  abbreviations: string;
  messageLength: string;
  punctuationDensity: string;
  slangLevel: string;
  fragmentStyle: string;
  grammarStyle: string;
  directness: string;
  questionFrequency: string;
  teasingStyle: string;
  humorStyle: string;
  doubleTexting: string;
  frenchStyle: string;
  darijaStyle: string;
  englishStyle: string;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function optionalStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function readEditablePreferences(profile: ImportedProfile): EditablePreferences {
  const datingIntent = objectValue(profile.datingIntent);
  const textingStyle = objectValue(profile.textingStyle);
  const languageBehavior = objectValue(textingStyle.languageBehavior);
  return {
    datingGoal: stringValue(datingIntent.defaultGoal, "open-to-see"),
    datingGoalDetails: optionalStringValue(datingIntent.datingGoalDetails),
    disclosureStrategy: stringValue(datingIntent.defaultDisclosureStrategy, "progressive"),
    formality: stringValue(textingStyle.formality, "very-casual"),
    capitalization: stringValue(textingStyle.capitalization, "relaxed"),
    emojiFrequency: stringValue(textingStyle.emojiFrequency, "low"),
    abbreviations: stringValue(textingStyle.abbreviations, "medium"),
    messageLength: stringValue(textingStyle.messageLength, "short"),
    punctuationDensity: stringValue(textingStyle.punctuationDensity, "low"),
    slangLevel: stringValue(textingStyle.slangLevel, "medium"),
    fragmentStyle: stringValue(textingStyle.fragmentStyle, "mixed"),
    grammarStyle: stringValue(textingStyle.grammarStyle, "casual"),
    directness: stringValue(textingStyle.directness, "balanced"),
    questionFrequency: stringValue(textingStyle.questionFrequency, "medium"),
    teasingStyle: stringValue(textingStyle.teasingStyle, "light"),
    humorStyle: stringValue(textingStyle.humorStyle, "playful"),
    doubleTexting: stringValue(textingStyle.doubleTexting, "sometimes"),
    frenchStyle: stringValue(languageBehavior.fr, "casual"),
    darijaStyle: stringValue(languageBehavior.darija, "natural"),
    englishStyle: stringValue(languageBehavior.en, "casual")
  };
}

export function writeEditablePreferences(profile: ImportedProfile, preferences: EditablePreferences): ImportedProfile {
  const datingIntent = objectValue(profile.datingIntent);
  const textingStyle = objectValue(profile.textingStyle);
  const datingGoalDetails = preferences.datingGoalDetails === undefined
    ? datingIntent.datingGoalDetails
    : preferences.datingGoalDetails.trim() || undefined;
  return {
    ...profile,
    datingIntent: {
      ...datingIntent,
      defaultGoal: preferences.datingGoal,
      datingGoalDetails,
      defaultDisclosureStrategy: preferences.disclosureStrategy,
      needsReview: false
    },
    textingStyle: {
      ...textingStyle,
      formality: preferences.formality,
      capitalization: preferences.capitalization,
      emojiFrequency: preferences.emojiFrequency,
      abbreviations: preferences.abbreviations,
      messageLength: preferences.messageLength,
      punctuationDensity: preferences.punctuationDensity,
      slangLevel: preferences.slangLevel,
      fragmentStyle: preferences.fragmentStyle,
      grammarStyle: preferences.grammarStyle,
      directness: preferences.directness,
      questionFrequency: preferences.questionFrequency,
      teasingStyle: preferences.teasingStyle,
      humorStyle: preferences.humorStyle,
      doubleTexting: preferences.doubleTexting,
      languageBehavior: {
        ...objectValue(textingStyle.languageBehavior),
        fr: preferences.frenchStyle,
        darija: preferences.darijaStyle,
        en: preferences.englishStyle
      }
    }
  };
}
