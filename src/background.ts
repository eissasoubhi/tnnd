import { generateSuggestions } from "./gemini";
import { getApiKey, getConfig, lockStorageToTrustedContexts } from "./storage";
import type { GenerateRequest, GenerateResponse } from "./types";

void lockStorageToTrustedContexts();

chrome.runtime.onInstalled.addListener(() => {
  void lockStorageToTrustedContexts();
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

function senderAllowed(sender: chrome.runtime.MessageSender): boolean {
  const url = sender.url ?? "";
  return url.startsWith("https://tinder.com/") || url.startsWith(`chrome-extension://${chrome.runtime.id}/`);
}

chrome.runtime.onMessage.addListener((message: GenerateRequest, sender, sendResponse) => {
  if (message?.type !== "GENERATE_SUGGESTIONS") return false;

  if (!senderAllowed(sender)) {
    sendResponse({ ok: false, error: "TNND rejected a request from an unexpected page." } satisfies GenerateResponse);
    return false;
  }

  void (async () => {
    try {
      const [apiKey, config] = await Promise.all([getApiKey(), getConfig()]);
      const suggestions = await generateSuggestions(apiKey, config, message.context);
      sendResponse({ ok: true, suggestions } satisfies GenerateResponse);
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown TNND error."
      } satisfies GenerateResponse);
    }
  })();

  return true;
});
