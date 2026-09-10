export type Tone = "playful" | "flirty" | "direct" | "warm" | "chill" | "witty";
export type MessageLength = "very-short" | "short" | "medium";
export type EmojiLevel = "none" | "low" | "medium";
export type GeneratePurpose = "manual" | "auto" | "preview";
export type ContactPreference = "instagram-first" | "whatsapp-first" | "stay-on-tinder";

export interface LanguageWeights {
  fr: number;
  darija: number;
  en: number;
}

export interface IdentityProfile {
  firstName: string;
  age: string;
  city: string;
  origin: string;
  occupation: string;
  interests: string;
  aboutMe: string;
  instagram: string;
  whatsapp: string;
  contactPreference: ContactPreference;
}

export interface AutomationConfig {
  enabled: boolean;
  replyDelaySeconds: number;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  maxAutoRepliesPerDay: number;
}

export interface AppConfig {
  model: string;
  tone: Tone;
  messageLength: MessageLength;
  flirtLevel: number;
  humorLevel: number;
  emojiLevel: EmojiLevel;
  replyCount: number;
  languages: LanguageWeights;
  preferredWords: string;
  avoidedWords: string;
  extraInstructions: string;
  identity: IdentityProfile;
  automation: AutomationConfig;
}

export interface GenerateRequest {
  type: "GENERATE_SUGGESTIONS";
  context: string;
  purpose?: GeneratePurpose;
  replyCount?: number;
}

export interface GenerateResponse {
  ok: boolean;
  suggestions?: string[];
  error?: string;
}
