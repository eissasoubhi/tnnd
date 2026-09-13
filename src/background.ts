import "./tinder-checkpoint-background";
import { generateSuggestions } from "./gemini";
import { getApiKey, getChatSettings, getConfig, lockStorageToTrustedContexts, resolveEffectiveConfig } from "./storage";
import type { AppConfig, GenerateRequest, GenerateResponse, PreviewOverrides } from "./types";

const AUTO_STATE_KEY = "tnnd.autoState";

interface AutoState {
  date: string;
  dailyCount: number;
  processed: Record<string, number>;
}

type TrustedContentRequest =
  | { type: "TNND_GET_CONTENT_CONFIG" }
  | { type: "TNND_GET_CHAT_AUTOMATION"; threadKey: string }
  | { type: "TNND_GET_AUTO_STATE" }
  | { type: "TNND_SAVE_AUTO_STATE"; state: AutoState };

void lockStorageToTrustedContexts();
chrome.runtime.onInstalled.addListener(() => void lockStorageToTrustedContexts());
chrome.action.onClicked.addListener(() => void chrome.runtime.openOptionsPage());

function senderAllowed(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const url = sender.url ?? "";
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`) || url.startsWith("https://tinder.com/") || url.startsWith("https://www.tinder.com/");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultAutoState(): AutoState {
  return { date: today(), dailyCount: 0, processed: {} };
}

function normalizeAutoState(value: unknown): AutoState {
  if (!value || typeof value !== "object") return defaultAutoState();
  const candidate = value as Partial<AutoState>;
  if (candidate.date !== today()) return defaultAutoState();
  const processed = candidate.processed && typeof candidate.processed === "object"
    ? Object.fromEntries(
        Object.entries(candidate.processed)
          .filter(([key, timestamp]) => Boolean(key) && typeof timestamp === "number" && Number.isFinite(timestamp))
          .slice(-5000)
      )
    : {};
  return {
    date: candidate.date,
    dailyCount: typeof candidate.dailyCount === "number" && Number.isFinite(candidate.dailyCount)
      ? Math.max(0, Math.floor(candidate.dailyCount))
      : 0,
    processed
  };
}

async function getAutoState(): Promise<AutoState> {
  const raw = (await chrome.storage.local.get(AUTO_STATE_KEY))[AUTO_STATE_KEY];
  return normalizeAutoState(raw);
}

async function saveAutoState(value: unknown): Promise<AutoState> {
  const state = normalizeAutoState(value);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  state.processed = Object.fromEntries(Object.entries(state.processed).filter(([, timestamp]) => timestamp >= cutoff));
  await chrome.storage.local.set({ [AUTO_STATE_KEY]: state });
  return state;
}

async function getContentConfig() {
  const config = await getConfig();
  return {
    model: config.model,
    tone: config.tone,
    messageLength: config.messageLength,
    flirtLevel: config.flirtLevel,
    humorLevel: config.humorLevel,
    emojiLevel: config.emojiLevel,
    languages: { ...config.languages },
    automation: { ...config.automation }
  };
}

function applyPreviewOverrides(config: AppConfig, overrides?: PreviewOverrides): AppConfig {
  if (!overrides) return config;
  return {
    ...config,
    tone: overrides.tone ?? config.tone,
    messageLength: overrides.messageLength ?? config.messageLength,
    flirtLevel: overrides.flirtLevel ?? config.flirtLevel,
    humorLevel: overrides.humorLevel ?? config.humorLevel,
    emojiLevel: overrides.emojiLevel ?? config.emojiLevel,
    languages: { ...config.languages, ...(overrides.languages ?? {}) },
    preferredWords: overrides.preferredWords ?? config.preferredWords,
    avoidedWords: overrides.avoidedWords ?? config.avoidedWords,
    extraInstructions: overrides.extraInstructions ?? config.extraInstructions
  };
}

chrome.runtime.onMessage.addListener((message: GenerateRequest | TrustedContentRequest, sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return false;
  if (!senderAllowed(sender)) {
    sendResponse({ ok: false, error: "TNND rejected a request from an unexpected page." });
    return false;
  }

  if (message.type === "TNND_GET_CONTENT_CONFIG") {
    void getContentConfig()
      .then((config) => sendResponse({ ok: true, config }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not load TNND content configuration." }));
    return true;
  }

  if (message.type === "TNND_GET_CHAT_AUTOMATION") {
    void getChatSettings(message.threadKey)
      .then((chat) => sendResponse({ ok: true, enabled: chat.enabled }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not load TNND chat configuration." }));
    return true;
  }

  if (message.type === "TNND_GET_AUTO_STATE") {
    void getAutoState()
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not load TNND automation state." }));
    return true;
  }

  if (message.type === "TNND_SAVE_AUTO_STATE") {
    void saveAutoState(message.state)
      .then((state) => sendResponse({ ok: true, state }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not save TNND automation state." }));
    return true;
  }

  if (message.type !== "GENERATE_SUGGESTIONS") return false;

  void (async () => {
    try {
      const [apiKey, baseConfig, chat] = await Promise.all([
        getApiKey(),
        getConfig(),
        getChatSettings(message.threadKey ?? "")
      ]);
      const purpose = message.purpose ?? "manual";
      if (purpose === "auto" && !chat.enabled) throw new Error("Automatic replies are disabled for this conversation.");
      const effective = resolveEffectiveConfig(baseConfig, chat);
      const config = purpose === "preview" ? applyPreviewOverrides(effective, message.previewOverrides) : effective;
      const suggestions = await generateSuggestions(apiKey, config, message.context, purpose, message.replyCount ?? config.replyCount, chat);
      sendResponse({ ok: true, suggestions } satisfies GenerateResponse);
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "Unknown TNND error." } satisfies GenerateResponse);
    }
  })();
  return true;
});
