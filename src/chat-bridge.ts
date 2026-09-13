import { TinderDomAdapter } from "./tinder-adapter";
import { executeBoundedTinderRead } from "./tinder-bounded-read-handlers";
import { planCurrentTinderJob, readCurrentTinderUiState } from "./tinder-runtime-state";
import { executeTinderSingleTabStep } from "./tinder-single-tab-executor";
import type { TinderJobKind } from "./tinder-state-machine";

const adapter = new TinderDomAdapter();
const tinderJobKinds = new Set<TinderJobKind>(["scan-inbox", "process-thread", "sync-only", "swipe"]);

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const input = message as { type?: string; job?: unknown; jobId?: unknown; conversationRef?: unknown };

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
