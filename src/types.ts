export type Tone = "playful" | "flirty" | "direct" | "warm" | "chill" | "witty";
export type MessageLength = "very-short" | "short" | "medium";
export type EmojiLevel = "none" | "low" | "medium";
export type GeneratePurpose = "manual" | "auto" | "preview";
export type ContactPreference = "instagram-first" | "whatsapp-first" | "stay-on-tinder";
export type ConversationStage = "auto" | "opener" | "discovery" | "playful" | "date-prep" | "off-app" | "re-engagement";

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
  /** @deprecated Kept only to migrate v0.2 profiles. */
  replyDelaySeconds?: number;
  replyDelayMinSeconds?: number;
  replyDelayMaxSeconds?: number;
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

export interface ChatSettings {
  enabled: boolean;
  alias: string;
  stage: ConversationStage;
  goal: string;
  instructions: string;
  tone?: Tone;
  messageLength?: MessageLength;
  flirtLevel?: number;
  humorLevel?: number;
  emojiLevel?: EmojiLevel;
  languages?: Partial<LanguageWeights>;
  preferredWords?: string;
  avoidedWords?: string;
}

export interface GenerateRequest {
  type: "GENERATE_SUGGESTIONS";
  context: string;
  purpose?: GeneratePurpose;
  replyCount?: number;
  threadKey?: string;
}

export interface GenerateResponse {
  ok: boolean;
  suggestions?: string[];
  error?: string;
}
