import {
  WEB_DIAGNOSTIC_CHANNEL,
  WEB_DIAGNOSTIC_REQUEST_CHANNEL,
  isTnndLocalWebUrl,
  type WebDiagnosticEvent
} from "./web-diagnostic-types";
import { hasLiveExtensionContext, sendRuntimeMessageSafely } from "./extension-context";

if (isTnndLocalWebUrl(window.location.href)) {
  let alive = true;

  window.addEventListener("message", (messageEvent) => {
    if (!alive || messageEvent.source !== window) return;
    if (!hasLiveExtensionContext()) {
      alive = false;
      return;
    }
    const payload = messageEvent.data as { source?: string; event?: WebDiagnosticEvent } | null;
    if (!payload || payload.source !== WEB_DIAGNOSTIC_CHANNEL || !payload.event) return;
    void sendRuntimeMessageSafely(
      {
        type: "TNND_WEB_DIAGNOSTIC_EVENT",
        event: payload.event
      },
      (message) => chrome.runtime.sendMessage(message),
      () => { alive = false; }
    ).catch((error) => {
      console.warn("TNND Web diagnostic bridge could not forward an event.", error);
    });
  });

  // Local bridge: watcher status is read-only; only the validated focus ceiling can be saved.
  // The background accepts these read requests only from TNND's local Web origin.
  const isTnndApp = ["http://127.0.0.1:5173", "http://localhost:5173"].includes(window.location.origin);
  if (isTnndApp) {
    // Narrow, account-checked attention channel. No arbitrary Chrome APIs or
    // extension storage access are exposed to the Web page.
    window.addEventListener("message", (event) => {
      if (!alive || event.source !== window || event.origin !== window.location.origin
        || !hasLiveExtensionContext()) return;
      const payload = event.data as {
        source?: unknown; requestId?: unknown; action?: unknown;
        userId?: unknown; capSeconds?: unknown;
      } | null;
      if (!payload || payload.source !== "TNND_ATTENTION_WEB_REQUEST_V1"
        || typeof payload.requestId !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(payload.requestId)
        || !["read", "save"].includes(String(payload.action))
        || typeof payload.userId !== "string" || payload.userId.length < 1
        || payload.userId.length > 128) return;
      const request = payload.action === "save"
        ? { type: "TNND_GLOBAL_ATTENTION_SET_CAP", userId: payload.userId, capSeconds: payload.capSeconds }
        : { type: "TNND_GLOBAL_ATTENTION_READ", userId: payload.userId };
      const requestId = payload.requestId;
      void sendRuntimeMessageSafely(
        request,
        (message) => chrome.runtime.sendMessage(message),
        () => { alive = false; }
      ).then((result) => {
        if (!alive) return;
        window.postMessage({
          source: "TNND_ATTENTION_WEB_RESPONSE_V1", requestId,
          result: result ?? { ok: false, error: "attention_extension_disconnected" }
        }, window.location.origin);
      }).catch(() => {
        if (!alive) return;
        window.postMessage({ source: "TNND_ATTENTION_WEB_RESPONSE_V1", requestId,
          result: { ok: false, error: "attention_extension_disconnected" } }, window.location.origin);
      });
    });

    const publishRunnerState = async (): Promise<void> => {
      if (!alive || !hasLiveExtensionContext()) return;
      try {
        const result = await chrome.runtime.sendMessage({ type: "TNND_GLOBAL_EXISTING_STATE" }) as {
          ok?: boolean;
          state?: {
            enabled?: boolean; phase?: string; phaseDetail?: string; currentLabel?: string | null;
            eligibleCount?: number; visitedCount?: number; sentCount?: number;
            skippedCount?: number; errorCount?: number; lastActionAt?: string | null;
            lastError?: string | null;
            activity?: Array<{ at: string; phase: string; detail: string; conversation: string | null }>;
          };
        };
        if (!result?.ok || !result.state) return;
        const state = result.state;
        window.postMessage({
          source: "TNND_GLOBAL_RUNNER_STATUS_V1",
          state: {
            enabled: state.enabled === true,
            phase: state.phase ?? "stopped",
            phaseDetail: state.phaseDetail ?? "",
            currentLabel: state.currentLabel ?? null,
            eligibleCount: Number(state.eligibleCount) || 0,
            visitedCount: Number(state.visitedCount) || 0,
            sentCount: Number(state.sentCount) || 0,
            skippedCount: Number(state.skippedCount) || 0,
            errorCount: Number(state.errorCount) || 0,
            lastActionAt: state.lastActionAt ?? null,
            lastError: state.lastError ?? null,
            activity: (state.activity ?? []).slice(-5)
          }
        }, window.location.origin);
      } catch { /* An outdated or disconnected extension stays read-only. */ }
    };
    void publishRunnerState();
    window.setInterval(() => { void publishRunnerState(); }, 3_000);
  }

  window.postMessage({ source: WEB_DIAGNOSTIC_REQUEST_CHANNEL, type: "snapshot" }, "*");
}
