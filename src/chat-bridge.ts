import { TinderDomAdapter } from "./tinder-adapter";

const adapter = new TinderDomAdapter();

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || (message as { type?: string }).type !== "TNND_GET_THREAD_INFO") return false;
  const diagnostics = adapter.diagnose();
  if (!diagnostics.composerFound) {
    sendResponse({ ok: true, threadKey: null });
    return false;
  }
  sendResponse({
    ok: true,
    threadKey: `${location.pathname}|${document.title}`,
    threadKeyHash: diagnostics.threadKeyHash
  });
  return false;
});
