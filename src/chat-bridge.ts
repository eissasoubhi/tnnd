import { TinderDomAdapter } from "./tinder-adapter";
import { readVisibleTinderMatchIdentity } from "./tinder-chat-identity";
import { visibleTinderThreadRefs } from "./tinder-visible-thread-links";
import { detectTinderChat } from "./tinder-chat-detection";
import { buildNormalizedMessageKeys } from "./tinder-message-key";
import { classifyTinderPath } from "./tinder-state-machine";
import { executeBoundedTinderRead } from "./tinder-bounded-read-handlers";
import { planCurrentTinderJob, readCurrentTinderUiState } from "./tinder-runtime-state";
import { executeTinderSingleTabStep } from "./tinder-single-tab-executor";
import type { TinderJobKind } from "./tinder-state-machine";

const adapter = new TinderDomAdapter();
const tinderJobKinds = new Set<TinderJobKind>(["scan-inbox", "process-thread", "sync-only", "swipe"]);

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: string; job?: unknown; jobId?: unknown; conversationRef?: unknown };

  if (input.type === "TNND_GET_VISIBLE_THREAD_LINKS") {
    const state = classifyTinderPath(location.pathname);
    if (state.state !== "inbox" && state.state !== "discovery") {
      sendResponse({ ok: false, error: "Open Tinder Messages before arming new match detection." });
      return false;
    }
    sendResponse({ ok: true, refs: visibleTinderThreadRefs() });
    return false;
  }

  if (input.type === "TNND_GET_THREAD_INFO") {
    const diagnostics = adapter.diagnose();
    const chat = detectTinderChat(location.pathname, diagnostics.composerFound);
    sendResponse({
      ok: true,
      threadKey: chat.threadKey,
      threadKeyHash: chat.threadKey ? diagnostics.threadKeyHash : null,
      source: chat.source,
      composerFound: diagnostics.composerFound,
      route: diagnostics.view
    });
    return false;
  }

  if (input.type === "TNND_GET_VISIBLE_THREAD_MESSAGES") {
    // Only a direct user interaction in the popup asks for message contents.
    // No navigation, no send and no implicit background upload is performed.
    const route = classifyTinderPath(location.pathname);
    if (route.state !== "conversation" || !route.conversationRef) {
      sendResponse({ ok: false, error: "not_conversation_route" });
      return false;
    }
    const diagnostics = adapter.diagnose();
    if (!diagnostics.composerFound) {
      sendResponse({ ok: false, error: "composer_not_found", view: diagnostics.view });
      return false;
    }
    const messages = adapter.readVisibleMessages();
    if (!messages.length) {
      sendResponse({ ok: false, error: "no_recognized_messages", view: diagnostics.view });
      return false;
    }
    const context = messages.map(message => `${message.direction === "me" ? "Me" : "Them"}: ${message.text}`).join("\n");
    const normalized = buildNormalizedMessageKeys(context, diagnostics.threadKeyHash);
    sendResponse({
      ok: true,
      threadKey: detectTinderChat(location.pathname, true).threadKey,
      conversationRef: route.conversationRef,
      identity: readVisibleTinderMatchIdentity(route.conversationRef),
      messages: normalized.map(message => ({
        key: message.key,
        direction: message.direction,
        text: message.text.slice(0, 4000)
      })),
      composerFound: true
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

  if (input.type === "TNND_ADVANCE_TINDER_JOB") {
    if (typeof input.job !== "string" || !tinderJobKinds.has(input.job as TinderJobKind)) {
      sendResponse({ ok: false, error: "invalid_tinder_job" });
      return false;
    }
    if (typeof input.jobId !== "string" || !input.jobId.trim()) {
      sendResponse({ ok: false, error: "invalid_tinder_job_id" });
      return false;
    }

    const kind = input.job as TinderJobKind;
    const conversationRef = typeof input.conversationRef === "string" ? input.conversationRef : undefined;
    const state = readCurrentTinderUiState();
    let boundedObservation: Record<string, unknown> | null = null;
    void executeTinderSingleTabStep(
      state,
      { id: input.jobId.trim(), kind, ...(conversationRef ? { conversationRef } : {}) },
      {
        navigate: async (path) => {
          location.assign(path);
        },
        execute: async (job, currentState) => {
          const result = executeBoundedTinderRead(adapter, job, currentState);
          boundedObservation = result.observation;
          return result.completed;
        }
      }
    )
      .then((result) => sendResponse({
        ok: true,
        checkpoint: result.checkpoint,
        navigated: result.navigated,
        completed: result.completed,
        observation: boundedObservation,
        requiresBoundedAction: result.step.action === "execute" && !result.completed
      }))
      .catch((error) => sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : "tinder_job_advance_failed"
      }));
    return true;
  }

  return false;
});
