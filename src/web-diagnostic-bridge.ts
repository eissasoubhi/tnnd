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

  // Status-only bridge; the Web app cannot start, stop or control the runner.
  // The background accepts these read requests only from TNND's local Web origin.
  const isTnndApp = ["http://127.0.0.1:5173", "http://localhost:5173"].includes(window.location.origin);
  if (isTnndApp) {
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
