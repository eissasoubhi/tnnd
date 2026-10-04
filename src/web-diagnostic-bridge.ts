import {
  WEB_DIAGNOSTIC_CHANNEL,
  WEB_DIAGNOSTIC_REQUEST_CHANNEL,
  isTnndLocalWebUrl,
  type WebDiagnosticEvent
} from "./web-diagnostic-types";
import { isExtensionContextInvalidated } from "./extension-context";

if (isTnndLocalWebUrl(window.location.href)) {
  let alive = true;

  window.addEventListener("message", (messageEvent) => {
    if (!alive || messageEvent.source !== window) return;
    const payload = messageEvent.data as { source?: string; event?: WebDiagnosticEvent } | null;
    if (!payload || payload.source !== WEB_DIAGNOSTIC_CHANNEL || !payload.event) return;
    void chrome.runtime.sendMessage({
      type: "TNND_WEB_DIAGNOSTIC_EVENT",
      event: payload.event
    }).catch((error) => {
      if (isExtensionContextInvalidated(error)) alive = false;
    });
  });

  window.postMessage({ source: WEB_DIAGNOSTIC_REQUEST_CHANNEL, type: "snapshot" }, "*");
}
