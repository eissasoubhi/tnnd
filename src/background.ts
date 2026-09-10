import { generateSuggestions } from "./gemini";
import { getApiKey, getChatSettings, getConfig, lockStorageToTrustedContexts, resolveEffectiveConfig } from "./storage";
import type { AppConfig, GenerateRequest, GenerateResponse, PreviewOverrides } from "./types";

void lockStorageToTrustedContexts();
chrome.runtime.onInstalled.addListener(() => void lockStorageToTrustedContexts());
chrome.action.onClicked.addListener(() => void chrome.runtime.openOptionsPage());

function senderAllowed(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id) return false;
  const url = sender.url ?? "";
  return url.startsWith(`chrome-extension://${chrome.runtime.id}/`) || url.startsWith("https://tinder.com/") || url.startsWith("https://www.tinder.com/");
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

chrome.runtime.onMessage.addListener((message: GenerateRequest, sender, sendResponse) => {
  if (message?.type !== "GENERATE_SUGGESTIONS") return false;
  if (!senderAllowed(sender)) {
    sendResponse({ ok: false, error: "TNND rejected a request from an unexpected page." } satisfies GenerateResponse);
    return false;
  }

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
