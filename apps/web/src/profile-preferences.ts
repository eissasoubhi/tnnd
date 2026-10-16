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
  globalTone?: string;
  flirtLevel?: number;
  humorLevel?: number;
  replyCount?: number;
  languageFr?: number;
  languageDarija?: number;
  languageEn?: number;
  preferredWords?: string;
  avoidedWords?: string;
  extraInstructions?: string;
  datingGoalDetails?: string;
  /** Passport / target city is NOT the user's current residence. */
  targetCities?: string;
  originCity?: string;
  instagram?: string;
  whatsapp?: string;
  contactPreference?: "instagram-first" | "whatsapp-first" | "stay-on-tinder";
  residenceCity?: string;
  currentCity?: string;
  originNeighborhood?: string;
  residenceNeighborhood?: string;
  multiPartRepliesEnabled?: boolean;
  multiPartMinCharacters?: number;
  pauseOnConfirmedMarriage?: string;
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
  const globalDefaults = objectValue(profile.conversationDefaults);
  const languages = objectValue(profile.languages);
  const identity = objectValue(profile.identity);
  const textingStyle = objectValue(profile.textingStyle);
  const languageBehavior = objectValue(textingStyle.languageBehavior);
  const matchProfileCapture = objectValue(profile.matchProfileCapture);
  const { baseline, autoAdapt } = parseStyleBaseline(textingStyle);
  const screening = objectValue(datingIntent.matchScreening);
  return {
    datingGoal: stringValue(datingIntent.defaultGoal, "open-to-see"),
    globalTone: stringValue(globalDefaults.tone, "playful"),
    flirtLevel: Number.isFinite(globalDefaults.flirtLevel) ? Math.max(0, Math.min(3, Number(globalDefaults.flirtLevel))) : 2,
    humorLevel: Number.isFinite(globalDefaults.humorLevel) ? Math.max(0, Math.min(100, Number(globalDefaults.humorLevel))) : 65,
    replyCount: Number.isInteger(globalDefaults.replyCount) ? Math.max(1, Math.min(5, Number(globalDefaults.replyCount))) : 3,
    languageFr: Number.isFinite(languages.fr) ? Math.max(0, Math.min(100, Number(languages.fr))) : 45,
    languageDarija: Number.isFinite(languages.darija) ? Math.max(0, Math.min(100, Number(languages.darija))) : 40,
    languageEn: Number.isFinite(languages.en) ? Math.max(0, Math.min(100, Number(languages.en))) : 15,
    preferredWords: optionalStringValue(globalDefaults.preferredWords),
    avoidedWords: optionalStringValue(globalDefaults.avoidedWords),
    extraInstructions: optionalStringValue(globalDefaults.extraInstructions),
    datingGoalDetails: optionalStringValue(datingIntent.datingGoalDetails),
    targetCities: Array.isArray(datingIntent.targetCities) ? datingIntent.targetCities.filter((city): city is string => typeof city === "string").join(", ") : "",
    originCity: optionalStringValue(identity.originCity) || optionalStringValue(identity.origin),
    instagram: optionalStringValue(identity.instagram),
    whatsapp: optionalStringValue(identity.whatsapp),
    contactPreference: ["instagram-first", "whatsapp-first", "stay-on-tinder"].includes(String(identity.contactPreference))
      ? identity.contactPreference as EditablePreferences["contactPreference"] : "instagram-first",
    residenceCity: optionalStringValue(identity.residenceCity) || optionalStringValue(identity.city),
    currentCity: optionalStringValue(identity.currentCity),
    originNeighborhood: optionalStringValue(identity.originNeighborhood),
    residenceNeighborhood: optionalStringValue(identity.residenceNeighborhood),
    multiPartRepliesEnabled: textingStyle.multiPartRepliesEnabled === true,
    multiPartMinCharacters: Number.isInteger(textingStyle.multiPartMinCharacters) ? Math.max(90, Math.min(400, Number(textingStyle.multiPartMinCharacters))) : 150,
    pauseOnConfirmedMarriage: screening.pauseOnConfirmedMarriage === true ? "true" : "false",
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
  const identity = objectValue(profile.identity);
  const textingStyle = objectValue(profile.textingStyle);
  const requestedDatingGoalDetails = preferences.datingGoalDetails;
  const targetCities = preferences.targetCities === undefined
    ? (Array.isArray(datingIntent.targetCities) ? datingIntent.targetCities : [])
    : [...new Set(preferences.targetCities.split(/[,;\n]+/).map(city => city.replace(/\s+/g, " ").trim()).filter(city => city.length >= 2 && city.length <= 80))].slice(0, 20);
  const existingScreening = objectValue(datingIntent.matchScreening);
  const globalDefaults = objectValue(profile.conversationDefaults);
  const languages = objectValue(profile.languages);
  const boundedExpressions = (value: string | undefined, previous: unknown) => value === undefined
    ? (Array.isArray(previous) ? previous : []) : [...new Set(value.split(/[,;\n]+/).map(v => v.trim()).filter(v => v.length >= 2 && v.length <= 80))].slice(0, 20);
  const height = preferences.maximumHeightCm === undefined ? existingScreening.maximumHeightCm
    : /^(?:1[0-9]{2}|2[0-2][0-9]|230)$/.test(preferences.maximumHeightCm.trim()) ? Number(preferences.maximumHeightCm.trim()) : null;
  const datingGoalDetails = requestedDatingGoalDetails === undefined
    ? datingIntent.datingGoalDetails
    : requestedDatingGoalDetails.trim() || undefined;
  return {
    ...profile,
    conversationDefaults: {
      ...globalDefaults,
      ...(preferences.globalTone !== undefined ? { tone: ["playful","flirty","direct","warm","chill","witty"].includes(preferences.globalTone) ? preferences.globalTone : "playful" } : {}),
      ...(Number.isFinite(preferences.flirtLevel) ? { flirtLevel: Math.min(3,Math.max(0,Math.round(preferences.flirtLevel!))) } : {}),
      ...(Number.isFinite(preferences.humorLevel) ? { humorLevel: Math.min(100,Math.max(0,Math.round(preferences.humorLevel!))) } : {}),
      ...(Number.isFinite(preferences.replyCount) ? { replyCount: Math.min(5,Math.max(1,Math.round(preferences.replyCount!))) } : {}),
      ...(preferences.preferredWords !== undefined ? { preferredWords: preferences.preferredWords.trim().slice(0,1600) } : {}),
      ...(preferences.avoidedWords !== undefined ? { avoidedWords: preferences.avoidedWords.trim().slice(0,1600) } : {}),
      ...(preferences.extraInstructions !== undefined ? { extraInstructions: preferences.extraInstructions.trim().slice(0,2000) } : {})
    },
    languages: {
      ...languages,
      ...(Number.isFinite(preferences.languageFr) ? { fr: Math.min(100,Math.max(0,Math.round(preferences.languageFr!))) } : {}),
      ...(Number.isFinite(preferences.languageDarija) ? { darija: Math.min(100,Math.max(0,Math.round(preferences.languageDarija!))) } : {}),
      ...(Number.isFinite(preferences.languageEn) ? { en: Math.min(100,Math.max(0,Math.round(preferences.languageEn!))) } : {})
    },
    identity: {
      ...identity,
      originCity: preferences.originCity === undefined ? identity.originCity : preferences.originCity.trim().slice(0,120),
      instagram: preferences.instagram === undefined ? identity.instagram : preferences.instagram.trim().slice(0,160),
      whatsapp: preferences.whatsapp === undefined ? identity.whatsapp : preferences.whatsapp.trim().slice(0,160),
      contactPreference: preferences.contactPreference === undefined ? identity.contactPreference : preferences.contactPreference,
      residenceCity: preferences.residenceCity === undefined ? identity.residenceCity : preferences.residenceCity.trim().slice(0,120),
      currentCity: preferences.currentCity === undefined ? identity.currentCity : preferences.currentCity.trim().slice(0,120),
      originNeighborhood: preferences.originNeighborhood === undefined ? identity.originNeighborhood : preferences.originNeighborhood.trim().slice(0,120),
      residenceNeighborhood: preferences.residenceNeighborhood === undefined ? identity.residenceNeighborhood : preferences.residenceNeighborhood.trim().slice(0,120)
    },
    datingIntent: {
      ...datingIntent,
      defaultGoal: preferences.datingGoal,
      datingGoalDetails,
      targetCities,
      matchScreening: {
        ...existingScreening,
        pauseOnConfirmedMarriage: preferences.pauseOnConfirmedMarriage === undefined
          ? existingScreening.pauseOnConfirmedMarriage === true : preferences.pauseOnConfirmedMarriage === "true",
        maximumHeightCm: height,
        casualExpressions: boundedExpressions(preferences.casualExpressions, existingScreening.casualExpressions),
        marriageExpressions: boundedExpressions(preferences.marriageExpressions, existingScreening.marriageExpressions)
      },
      defaultDisclosureStrategy: preferences.disclosureStrategy,
      needsReview: false
    },
    textingStyle: {
      ...textingStyle,
      multiPartRepliesEnabled: preferences.multiPartRepliesEnabled === undefined ? textingStyle.multiPartRepliesEnabled === true : preferences.multiPartRepliesEnabled,
      multiPartMinCharacters: preferences.multiPartMinCharacters === undefined ? (textingStyle.multiPartMinCharacters ?? 150) : Math.max(90, Math.min(400, Math.round(preferences.multiPartMinCharacters))),
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
