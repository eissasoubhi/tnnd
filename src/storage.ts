import { findLegacyChatSettingsKey } from "./tinder-chat-detection";
import type { AppConfig, ChatSettings } from "./types";
import { defaultSyncState, type SyncState } from "./sync-status";
import { applyServerProfile } from "./server-effective-config";
import { DEFAULT_FIRST_MESSAGE_DAILY_LIMIT, firstMessageDailyLimit } from "./tinder-first-message-daily-limit";
import { DEFAULT_OPENER_MIN_SECONDS, DEFAULT_OPENER_MAX_SECONDS, openerTypingReferenceWindow } from "./tinder-opener-timing";

const CONFIG_KEY = "tnnd.config";
const API_KEY_KEY = "tnnd.geminiApiKey";
const CHAT_SETTINGS_KEY = "tnnd.chatSettings";
const SYNC_STATE_KEY = "tnnd.syncState";
const BACKEND_SESSION_KEY = "tnnd.backendSession";
const BACKEND_PROFILE_CACHE_KEY = "tnnd.backendProfileCache";

export interface BackendSession {
  token: string;
  expiresAt: string;
  user: { id: string; email: string };
}

export interface BackendProfileCache {
  userId?: string;
  profile: Record<string, unknown>;
  updatedAt: string;
  syncedAt: string;
}

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
  conversationFlowEnabled: true,
  conversationFlowOrder: "default",
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
    openerDelayMinSeconds: DEFAULT_OPENER_MIN_SECONDS,
    openerDelayMaxSeconds: DEFAULT_OPENER_MAX_SECONDS,
    multiPartRepliesEnabled: false,
    multiPartMinCharacters: 150,
    multiPartDelayMinSeconds: 3,
    multiPartDelayMaxSeconds: 10,
    quietHoursEnabled: true,
    quietStart: "00:00",
    quietEnd: "08:00",
    maxAutoRepliesPerDay: 40,
    maxFirstMessagesPerDay: DEFAULT_FIRST_MESSAGE_DAILY_LIMIT
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

/** Never reuse stale/legacy Web profile cache across sign-outs or accounts. */
export function cacheBelongsToSession(
  cache: BackendProfileCache | null | undefined,
  session: BackendSession | null | undefined,
  now = Date.now()
): boolean {
  return Boolean(cache?.userId && cache.userId === session?.user?.id
    && session?.token && session.expiresAt
    && Number.isFinite(Date.parse(session.expiresAt)) && Date.parse(session.expiresAt) > now);
}

export async function getConfig(options: { includeBackendProfile?: boolean } = {}): Promise<AppConfig> {
  const result = await chrome.storage.local.get([CONFIG_KEY, BACKEND_PROFILE_CACHE_KEY, BACKEND_SESSION_KEY]);
  const saved = result[CONFIG_KEY] as LegacyConfig | undefined;
  const savedAutomation = (saved?.automation ?? {}) as Partial<AppConfig["automation"]>;
  const legacyDelay = Number(savedAutomation.replyDelaySeconds);
  const hasWindow = Number.isFinite(savedAutomation.replyDelayMinSeconds) || Number.isFinite(savedAutomation.replyDelayMaxSeconds);
  const [openerDelayMinSeconds, openerDelayMaxSeconds] = openerTypingReferenceWindow(savedAutomation);

  const localConfig: AppConfig = {
    ...DEFAULT_CONFIG,
    ...saved,
    conversationFlowEnabled: saved?.conversationFlowEnabled !== false,
    conversationFlowOrder: ["default", "work-first", "interests-first"].includes(String(saved?.conversationFlowOrder))
      ? saved!.conversationFlowOrder : "default",
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
      maxFirstMessagesPerDay: firstMessageDailyLimit(savedAutomation.maxFirstMessagesPerDay),
      openerDelayMinSeconds, openerDelayMaxSeconds,
      ...(hasWindow ? {} : Number.isFinite(legacyDelay) ? {
        replyDelayMinSeconds: Math.max(0, legacyDelay - 15),
        replyDelayMaxSeconds: Math.max(0, legacyDelay + 15)
      } : {})
    }
  };

  const cache = result[BACKEND_PROFILE_CACHE_KEY] as BackendProfileCache | undefined;
  const session = result[BACKEND_SESSION_KEY] as BackendSession | undefined;
  return options.includeBackendProfile === false
    ? localConfig
    : applyServerProfile(localConfig, cacheBelongsToSession(cache, session) ? cache!.profile : undefined);
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

export async function getChatSettings(threadKey: string): Promise<ChatSettings> {
  if (!threadKey) return { ...DEFAULT_CHAT_SETTINGS };
  const result = await chrome.storage.local.get(CHAT_SETTINGS_KEY);
  const map = result[CHAT_SETTINGS_KEY] as Record<string, Partial<ChatSettings>> | undefined;
  // Older popup versions included document.title in the key. Safely recover the
  // matching conversation's settings without mistaking another thread for it.
  const legacyKey = map && !(threadKey in map)
    ? findLegacyChatSettingsKey(Object.keys(map), threadKey)
    : null;
  const saved = map?.[threadKey] ?? (legacyKey ? map?.[legacyKey] : undefined);
  if (saved && legacyKey) {
    await chrome.storage.local.set({ [CHAT_SETTINGS_KEY]: { ...map, [threadKey]: saved } });
  }
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

export async function getBackendSession(): Promise<BackendSession | null> {
  const result = await chrome.storage.local.get(BACKEND_SESSION_KEY);
  const value = result[BACKEND_SESSION_KEY] as BackendSession | undefined;
  if (!value?.token || !value?.expiresAt || !value.user?.id || !value.user?.email) return null;
  if (Date.parse(value.expiresAt) <= Date.now()) {
    await chrome.storage.local.remove(BACKEND_SESSION_KEY);
    return null;
  }
  return value;
}

export async function saveBackendSession(session: BackendSession): Promise<void> {
  await chrome.storage.local.set({ [BACKEND_SESSION_KEY]: session });
}

export async function clearBackendSession(): Promise<void> {
  await chrome.storage.local.remove(BACKEND_SESSION_KEY);
}

export async function getBackendProfileCache(): Promise<BackendProfileCache | null> {
  const result = await chrome.storage.local.get([BACKEND_PROFILE_CACHE_KEY, BACKEND_SESSION_KEY]);
  const value = result[BACKEND_PROFILE_CACHE_KEY] as BackendProfileCache | undefined;
  const session = result[BACKEND_SESSION_KEY] as BackendSession | undefined;
  return value?.profile && value.updatedAt && value.syncedAt && cacheBelongsToSession(value, session) ? value : null;
}

export async function saveBackendProfileCache(cache: BackendProfileCache): Promise<void> {
  await chrome.storage.local.set({ [BACKEND_PROFILE_CACHE_KEY]: cache });
}

export async function clearBackendProfileCache(): Promise<void> {
  await chrome.storage.local.remove(BACKEND_PROFILE_CACHE_KEY);
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
