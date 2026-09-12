import type { AppConfig, ChatSettings } from "./types";
import { defaultSyncState, type SyncState } from "./sync-status";

const CONFIG_KEY = "tnnd.config";
const API_KEY_KEY = "tnnd.geminiApiKey";
const CHAT_SETTINGS_KEY = "tnnd.chatSettings";
const SYNC_STATE_KEY = "tnnd.syncState";

export const DEFAULT_CONFIG: AppConfig = {
  model: "gemini-3.8-flash",
  tone: "playful",
  messageLength: "short",
  flirtLevel: 2,
  humorLevel: 65,
  emojiLevel: "low",
  replyCount: 3,
  languages: { fr: 45, darija: 40, en: 15 },
  preferredWords: "",
  avoidedWords: "",
  extraInstructions: "",
  textingStyle: {
    formality: "very-casual",
    capitalization: "mostly-lowercase",
    punctuation: "low",
    abbreviations: "medium",
    slang: "natural",
    fragmentedMessages: true,
    perfectGrammar: false,
    questionFrequency: "medium",
    doubleTexting: "sometimes"
  },
  identity: {
    firstName: "",
    age: "",
    city: "",
    origin: "",
    occupation: "",
    interests: "",
    aboutMe: "",
    instagram: "",
    whatsapp: "",
    contactPreference: "instagram-first"
  },
  automation: {
    enabled: false,
    replyDelayMinSeconds: 20,
    replyDelayMaxSeconds: 60,
    quietHoursEnabled: true,
    quietStart: "00:00",
    quietEnd: "08:00",
    maxAutoRepliesPerDay: 40
  }
};

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
  enabled: true,
  alias: "",
  stage: "auto",
  goal: "",
  instructions: ""
};

type LegacyConfig = Partial<AppConfig> & {
  personalContext?: string;
  languages?: Partial<AppConfig["languages"]> & { ar?: number };
};

export async function lockStorageToTrustedContexts(): Promise<void> {
  try {
    await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  } catch (error) {
    console.warn("TNND could not restrict storage access level", error);
  }
}

export async function getConfig(): Promise<AppConfig> {
  const result = await chrome.storage.local.get(CONFIG_KEY);
  const saved = result[CONFIG_KEY] as LegacyConfig | undefined;
  const savedAutomation = (saved?.automation ?? {}) as Partial<AppConfig["automation"]>;
  const legacyDelay = Number(savedAutomation.replyDelaySeconds);
  const hasWindow = Number.isFinite(savedAutomation.replyDelayMinSeconds) || Number.isFinite(savedAutomation.replyDelayMaxSeconds);

  return {
    ...DEFAULT_CONFIG,
    ...saved,
    languages: { ...DEFAULT_CONFIG.languages, ...(saved?.languages ?? {}) },
    textingStyle: { ...DEFAULT_CONFIG.textingStyle!, ...(saved?.textingStyle ?? {}) },
    identity: {
      ...DEFAULT_CONFIG.identity,
      ...(saved?.identity ?? {}),
      aboutMe: saved?.identity?.aboutMe ?? saved?.personalContext ?? DEFAULT_CONFIG.identity.aboutMe
    },
    automation: {
      ...DEFAULT_CONFIG.automation,
      ...savedAutomation,
      ...(hasWindow ? {} : Number.isFinite(legacyDelay) ? {
        replyDelayMinSeconds: Math.max(0, legacyDelay - 15),
        replyDelayMaxSeconds: Math.max(0, legacyDelay + 15)
      } : {})
    }
  };
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

export async function getChatSettings(threadKey: string): Promise<ChatSettings> {
  if (!threadKey) return { ...DEFAULT_CHAT_SETTINGS };
  const result = await chrome.storage.local.get(CHAT_SETTINGS_KEY);
  const map = result[CHAT_SETTINGS_KEY] as Record<string, Partial<ChatSettings>> | undefined;
  const saved = map?.[threadKey];
  return {
    ...DEFAULT_CHAT_SETTINGS,
    ...(saved ?? {}),
    languages: saved?.languages ? { ...saved.languages } : undefined
  };
}

export async function saveChatSettings(threadKey: string, settings: ChatSettings): Promise<void> {
  if (!threadKey) throw new Error("A thread key is required to save per-chat settings.");
  const result = await chrome.storage.local.get(CHAT_SETTINGS_KEY);
  const map = (result[CHAT_SETTINGS_KEY] as Record<string, ChatSettings> | undefined) ?? {};
  map[threadKey] = settings;
  await chrome.storage.local.set({ [CHAT_SETTINGS_KEY]: map });
}

export async function getSyncState(): Promise<SyncState> {
  const result = await chrome.storage.local.get(SYNC_STATE_KEY);
  const saved = result[SYNC_STATE_KEY] as Partial<SyncState> | undefined;
  return { ...defaultSyncState, ...(saved ?? {}) };
}

export async function saveSyncState(state: SyncState): Promise<void> {
  await chrome.storage.local.set({ [SYNC_STATE_KEY]: state });
}

export function resolveEffectiveConfig(base: AppConfig, chat: ChatSettings): AppConfig {
  return {
    ...base,
    tone: chat.tone ?? base.tone,
    messageLength: chat.messageLength ?? base.messageLength,
    flirtLevel: chat.flirtLevel ?? base.flirtLevel,
    humorLevel: chat.humorLevel ?? base.humorLevel,
    emojiLevel: chat.emojiLevel ?? base.emojiLevel,
    languages: { ...base.languages, ...(chat.languages ?? {}) },
    preferredWords: chat.preferredWords ?? base.preferredWords,
    avoidedWords: chat.avoidedWords ?? base.avoidedWords
  };
}

export async function getApiKey(): Promise<string> {
  const result = await chrome.storage.local.get(API_KEY_KEY);
  return typeof result[API_KEY_KEY] === "string" ? result[API_KEY_KEY] : "";
}

export async function saveApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_KEY]: apiKey.trim() });
}
