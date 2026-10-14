import type { ImportedProfile } from "./profile-import";
import { parseStyleBaseline, type AutoAdaptFlags } from "../../../src/adaptive-preferences";

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
  /** Passport / target city is NOT the user's current residence. */
  targetCities?: string;
  pauseOnConfirmedMarriage?: boolean;
  maximumHeightCm?: string;
  casualExpressions?: string;
  marriageExpressions?: string;
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
  autoAdapt?: AutoAdaptFlags;
  temporaryMatchProfileRetentionDays?: number;
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

function retentionDaysValue(value: unknown): number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 30 ? Number(value) : 7;
}

export function readEditablePreferences(profile: ImportedProfile): EditablePreferences {
  const datingIntent = objectValue(profile.datingIntent);
  const textingStyle = objectValue(profile.textingStyle);
  const languageBehavior = objectValue(textingStyle.languageBehavior);
  const matchProfileCapture = objectValue(profile.matchProfileCapture);
  const { baseline, autoAdapt } = parseStyleBaseline(textingStyle);
  const screening = objectValue(datingIntent.matchScreening);
  return {
    datingGoal: stringValue(datingIntent.defaultGoal, "open-to-see"),
    datingGoalDetails: optionalStringValue(datingIntent.datingGoalDetails),
    targetCities: Array.isArray(datingIntent.targetCities) ? datingIntent.targetCities.filter((city): city is string => typeof city === "string").join(", ") : "",
    pauseOnConfirmedMarriage: screening.pauseOnConfirmedMarriage === true,
    maximumHeightCm: Number.isInteger(screening.maximumHeightCm) ? String(screening.maximumHeightCm) : "",
    casualExpressions: Array.isArray(screening.casualExpressions) ? screening.casualExpressions.filter((x): x is string => typeof x === "string").join(", ") : "",
    marriageExpressions: Array.isArray(screening.marriageExpressions) ? screening.marriageExpressions.filter((x): x is string => typeof x === "string").join(", ") : "",
    disclosureStrategy: stringValue(datingIntent.defaultDisclosureStrategy, "progressive"),
    formality: stringValue(textingStyle.formality, "very-casual"),
    capitalization: stringValue(textingStyle.capitalization, "relaxed"),
    emojiFrequency: stringValue(textingStyle.emojiFrequency, "low"),
    abbreviations: stringValue(textingStyle.abbreviations, "medium"),
    messageLength: baseline.messageLength,
    punctuationDensity: stringValue(textingStyle.punctuationDensity, "low"),
    slangLevel: stringValue(textingStyle.slangLevel, "medium"),
    fragmentStyle: stringValue(textingStyle.fragmentStyle, "mixed"),
    grammarStyle: stringValue(textingStyle.grammarStyle, "casual"),
    directness: baseline.directness,
    questionFrequency: stringValue(textingStyle.questionFrequency, "medium"),
    teasingStyle: baseline.teasingStyle,
    humorStyle: baseline.humorStyle,
    doubleTexting: baseline.doubleTexting,
    frenchStyle: stringValue(languageBehavior.fr, "casual"),
    darijaStyle: stringValue(languageBehavior.darija, "natural"),
    englishStyle: stringValue(languageBehavior.en, "casual"),
    autoAdapt,
    temporaryMatchProfileRetentionDays: retentionDaysValue(matchProfileCapture.temporaryRetentionDays)
  };
}

export function writeEditablePreferences(profile: ImportedProfile, preferences: EditablePreferences): ImportedProfile {
  const datingIntent = objectValue(profile.datingIntent);
  const textingStyle = objectValue(profile.textingStyle);
  const requestedDatingGoalDetails = preferences.datingGoalDetails;
  const targetCities = preferences.targetCities === undefined
    ? (Array.isArray(datingIntent.targetCities) ? datingIntent.targetCities : [])
    : [...new Set(preferences.targetCities.split(/[,;\n]+/).map(city => city.replace(/\s+/g, " ").trim()).filter(city => city.length >= 2 && city.length <= 80))].slice(0, 20);
  const existingScreening = objectValue(datingIntent.matchScreening);
  const boundedExpressions = (value: string | undefined, previous: unknown) => value === undefined
    ? (Array.isArray(previous) ? previous : []) : [...new Set(value.split(/[,;\n]+/).map(v => v.trim()).filter(v => v.length >= 4 && v.length <= 80))].slice(0, 20);
  const height = preferences.maximumHeightCm === undefined ? existingScreening.maximumHeightCm
    : /^(?:1[0-9]{2}|2[0-2][0-9]|230)$/.test(preferences.maximumHeightCm.trim()) ? Number(preferences.maximumHeightCm.trim()) : null;
  const datingGoalDetails = requestedDatingGoalDetails === undefined
    ? datingIntent.datingGoalDetails
    : requestedDatingGoalDetails.trim() || undefined;
  return {
    ...profile,
    datingIntent: {
      ...datingIntent,
      defaultGoal: preferences.datingGoal,
      datingGoalDetails,
      targetCities,
      matchScreening: {
        ...existingScreening,
        pauseOnConfirmedMarriage: preferences.pauseOnConfirmedMarriage ?? (existingScreening.pauseOnConfirmedMarriage === true),
        maximumHeightCm: height,
        casualExpressions: boundedExpressions(preferences.casualExpressions, existingScreening.casualExpressions),
        marriageExpressions: boundedExpressions(preferences.marriageExpressions, existingScreening.marriageExpressions)
      },
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
      autoAdapt: { ...parseStyleBaseline(textingStyle).autoAdapt, ...(preferences.autoAdapt ?? {}) },
      languageBehavior: {
        ...objectValue(textingStyle.languageBehavior),
        fr: preferences.frenchStyle,
        darija: preferences.darijaStyle,
        en: preferences.englishStyle
      }
    },
    matchProfileCapture: {
      ...objectValue(profile.matchProfileCapture),
      temporaryRetentionDays: retentionDaysValue(preferences.temporaryMatchProfileRetentionDays)
    }
  };
}
