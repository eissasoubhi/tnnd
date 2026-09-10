import type { AppConfig } from "./types";

const CONFIG_KEY = "tnnd.config";
const API_KEY_KEY = "tnnd.geminiApiKey";

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
    replyDelaySeconds: 45,
    quietHoursEnabled: true,
    quietStart: "00:00",
    quietEnd: "08:00",
    maxAutoRepliesPerDay: 40
  }
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
  return {
    ...DEFAULT_CONFIG,
    ...saved,
    languages: { ...DEFAULT_CONFIG.languages, ...(saved?.languages ?? {}) },
    identity: {
      ...DEFAULT_CONFIG.identity,
      ...(saved?.identity ?? {}),
      aboutMe: saved?.identity?.aboutMe ?? saved?.personalContext ?? DEFAULT_CONFIG.identity.aboutMe
    },
    automation: { ...DEFAULT_CONFIG.automation, ...(saved?.automation ?? {}) }
  };
}

export async function saveConfig(config: AppConfig): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_KEY]: config });
}

export async function getApiKey(): Promise<string> {
  const result = await chrome.storage.local.get(API_KEY_KEY);
  return typeof result[API_KEY_KEY] === "string" ? result[API_KEY_KEY] : "";
}

export async function saveApiKey(apiKey: string): Promise<void> {
  await chrome.storage.local.set({ [API_KEY_KEY]: apiKey.trim() });
}
