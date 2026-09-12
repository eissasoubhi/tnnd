import type { AppConfig, EmojiLevel, MessageLength, TextingFormality, TextingFrequency, Tone } from "./types";

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function optionalString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function applyServerProfile(base: AppConfig, profile: Record<string, unknown> | null | undefined): AppConfig {
  if (!profile) return base;

  const identity = objectValue(profile.identity);
  const languages = objectValue(profile.languages);
  const textingStyle = objectValue(profile.textingStyle);
  const automation = objectValue(profile.automation);
  const conversationDefaults = objectValue(profile.conversationDefaults);

  const formality = stringValue<TextingFormality>(textingStyle.formality, ["very-casual", "casual", "neutral"], base.textingStyle?.formality ?? "very-casual");
  const capitalization = stringValue(textingStyle.capitalization, ["mostly-lowercase", "normal"] as const, base.textingStyle?.capitalization ?? "mostly-lowercase");
  const punctuation = stringValue<TextingFrequency>(textingStyle.punctuation, ["low", "medium", "high"], base.textingStyle?.punctuation ?? "low");
  const abbreviations = stringValue<TextingFrequency>(textingStyle.abbreviations, ["low", "medium", "high"], base.textingStyle?.abbreviations ?? "medium");
  const slang = stringValue(textingStyle.slang, ["none", "natural", "high"] as const, base.textingStyle?.slang ?? "natural");
  const questionFrequency = stringValue<TextingFrequency>(textingStyle.questionFrequency, ["low", "medium", "high"], base.textingStyle?.questionFrequency ?? "medium");
  const doubleTexting = stringValue(textingStyle.doubleTexting, ["rarely", "sometimes", "often"] as const, base.textingStyle?.doubleTexting ?? "sometimes");

  return {
    ...base,
    model: optionalString(conversationDefaults.model, base.model),
    tone: stringValue<Tone>(conversationDefaults.tone, ["playful", "flirty", "direct", "warm", "chill", "witty"], base.tone),
    messageLength: stringValue<MessageLength>(textingStyle.messageLength ?? conversationDefaults.messageLength, ["very-short", "short", "medium"], base.messageLength),
    flirtLevel: numberValue(conversationDefaults.flirtLevel, base.flirtLevel, 0, 5),
    humorLevel: numberValue(conversationDefaults.humorLevel, base.humorLevel, 0, 100),
    emojiLevel: stringValue<EmojiLevel>(textingStyle.emojiFrequency ?? conversationDefaults.emojiLevel, ["none", "low", "medium"], base.emojiLevel),
    replyCount: numberValue(conversationDefaults.replyCount, base.replyCount, 1, 5),
    preferredWords: optionalString(conversationDefaults.preferredWords, base.preferredWords),
    avoidedWords: optionalString(conversationDefaults.avoidedWords, base.avoidedWords),
    extraInstructions: optionalString(conversationDefaults.extraInstructions, base.extraInstructions),
    languages: {
      fr: numberValue(languages.fr, base.languages.fr, 0, 100),
      darija: numberValue(languages.darija, base.languages.darija, 0, 100),
      en: numberValue(languages.en, base.languages.en, 0, 100)
    },
    textingStyle: {
      formality,
      capitalization,
      punctuation,
      abbreviations,
      slang,
      fragmentedMessages: booleanValue(textingStyle.fragmentedMessages, base.textingStyle?.fragmentedMessages ?? true),
      perfectGrammar: booleanValue(textingStyle.perfectGrammar, base.textingStyle?.perfectGrammar ?? false),
      questionFrequency,
      doubleTexting
    },
    identity: {
      firstName: optionalString(identity.firstName, base.identity.firstName),
      age: optionalString(identity.age, base.identity.age),
      city: optionalString(identity.city, base.identity.city),
      origin: optionalString(identity.origin, base.identity.origin),
      occupation: optionalString(identity.occupation, base.identity.occupation),
      interests: optionalString(identity.interests, base.identity.interests),
      aboutMe: optionalString(identity.aboutMe, base.identity.aboutMe),
      instagram: optionalString(identity.instagram, base.identity.instagram),
      whatsapp: optionalString(identity.whatsapp, base.identity.whatsapp),
      contactPreference: stringValue(identity.contactPreference, ["instagram-first", "whatsapp-first", "stay-on-tinder"] as const, base.identity.contactPreference)
    },
    automation: {
      ...base.automation,
      enabled: booleanValue(automation.enabled, base.automation.enabled),
      replyDelayMinSeconds: numberValue(automation.replyDelayMinSeconds, base.automation.replyDelayMinSeconds ?? 20, 0, 3600),
      replyDelayMaxSeconds: numberValue(automation.replyDelayMaxSeconds, base.automation.replyDelayMaxSeconds ?? 60, 0, 3600),
      quietHoursEnabled: booleanValue(automation.quietHoursEnabled, base.automation.quietHoursEnabled),
      quietStart: optionalString(automation.quietStart, base.automation.quietStart),
      quietEnd: optionalString(automation.quietEnd, base.automation.quietEnd),
      maxAutoRepliesPerDay: numberValue(automation.maxAutoRepliesPerDay, base.automation.maxAutoRepliesPerDay, 0, 500)
    }
  };
}
