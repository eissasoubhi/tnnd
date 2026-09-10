export type Tone = "playful" | "flirty" | "direct" | "warm" | "chill" | "witty";
export type MessageLength = "very-short" | "short" | "medium";
export type EmojiLevel = "none" | "low" | "medium";

export interface LanguageWeights {
  fr: number;
  darija: number;
  en: number;
  ar: number;
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
  personalContext: string;
  extraInstructions: string;
}

export interface GenerateRequest {
  type: "GENERATE_SUGGESTIONS";
  context: string;
}

export interface GenerateResponse {
  ok: boolean;
  suggestions?: string[];
  error?: string;
}
