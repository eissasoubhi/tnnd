import { TinderDomAdapter } from "./tinder-adapter";
import { planCurrentTinderJob, readCurrentTinderUiState } from "./tinder-runtime-state";
import type { TinderJobKind } from "./tinder-state-machine";

const adapter = new TinderDomAdapter();
const tinderJobKinds = new Set<TinderJobKind>(["scan-inbox", "process-thread", "sync-only", "swipe"]);

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: string; job?: unknown; conversationRef?: unknown };

  if (input.type === "TNND_GET_THREAD_INFO") {
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
  }

  if (input.type === "TNND_GET_TINDER_RUNTIME_STATE") {
    sendResponse({ ok: true, state: readCurrentTinderUiState() });
    return false;
  }

  if (input.type === "TNND_PLAN_TINDER_JOB") {
    if (typeof input.job !== "string" || !tinderJobKinds.has(input.job as TinderJobKind)) {
      sendResponse({ ok: false, error: "invalid_tinder_job" });
      return false;
    }
    const conversationRef = typeof input.conversationRef === "string" ? input.conversationRef : undefined;
    sendResponse({ ok: true, decision: planCurrentTinderJob(input.job as TinderJobKind, conversationRef) });
    return false;
  }

  return false;
});
