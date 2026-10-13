import { isTnndLocalWebUrl } from "./web-diagnostic-types";
import { runWebUiAudit } from "./web-ui-audit";

// No background scanning or automatic user-action clicks. The popup must
// explicitly request the audit on the selected local TNND Web tab.
if (isTnndLocalWebUrl(location.href)) {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== "object" || (message as { type?: string }).type !== "TNND_RUN_WEB_UI_AUDIT") return false;
    void runWebUiAudit()
      .then(report => sendResponse({ ok: true, report }))
      .catch(error => sendResponse({ ok: false, error: error instanceof Error ? error.message : "ui_audit_failed" }));
    return true;
  });
}
