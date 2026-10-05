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

  window.postMessage({ source: WEB_DIAGNOSTIC_REQUEST_CHANNEL, type: "snapshot" }, "*");
}
