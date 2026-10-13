import assert from "node:assert/strict";
import {
  analyzeWebDiagnosticState,
  isTnndLocalWebUrl,
  sanitizeWebDiagnosticText,
  sanitizeWebDiagnosticUrl
} from "../src/web-diagnostic-types.ts";

assert.equal(isTnndLocalWebUrl("http://127.0.0.1:5173/"), true);
assert.equal(isTnndLocalWebUrl("http://localhost:5173/dashboard"), true);
assert.equal(isTnndLocalWebUrl("http://localhost:4000/"), false);
assert.equal(sanitizeWebDiagnosticUrl("ws://127.0.0.1:5173/?token=secret#x"), "ws://127.0.0.1:5173/");
assert.equal(sanitizeWebDiagnosticText("https://localhost:5173/path?token=abc"), "https://localhost:5173/path");

const base = {
  tabId: 1,
  pageUrl: "http://127.0.0.1:5173/",
  pageSessionId: "page-1",
  startedAt: 1_000,
  updatedAt: 10_000,
  lastHeartbeatAt: 9_500,
  lastHeartbeatDriftMs: 0,
  readyState: "complete",
  pendingRequests: {},
  openSockets: {
    ws: { id: "ws", url: "ws://127.0.0.1:5173/", createdAt: 2_000, openedAt: 2_100 }
  },
  events: []
};

const healthy = analyzeWebDiagnosticState(base, 10_000);
assert.equal(healthy.level, "healthy");
assert.match(healthy.summary, /101\/Pending est normal/);

const blocked = analyzeWebDiagnosticState({ ...base, lastHeartbeatAt: 1_000 }, 10_000);
assert.equal(blocked.level, "blocked");
assert.match(blocked.summary, /thread principal semble bloqué/);

const pending = analyzeWebDiagnosticState({
  ...base,
  openSockets: {},
  pendingRequests: {
    req: { id: "req", kind: "fetch", url: "http://127.0.0.1:4000/api/v1/profile", method: "GET", startedAt: 1_000 }
  }
}, 12_500);
assert.equal(pending.level, "warning");
assert.match(pending.summary, /requête HTTP reste en attente/);

const failedFunction = analyzeWebDiagnosticState({
  ...base,
  events: [{
    kind: "ui-click", pageSessionId: "page-1", at: 9_600, detail: "generate-draft"
  }, {
    kind: "fetch-end", pageSessionId: "page-1", at: 9_700,
    id: "req", method: "POST",
    url: "http://127.0.0.1:5173/api/v1/conversations/[conversation]/generate",
    status: 500
  }, {
    kind: "app-error", pageSessionId: "page-1", at: 9_701,
    id: "req", method: "POST",
    url: "http://127.0.0.1:5173/api/v1/conversations/[conversation]/generate",
    status: 500, detail: "internal_error"
  }]
}, 10_000);
assert.equal(failedFunction.level, "warning");
assert.match(failedFunction.summary, /API\/function failure/);
assert.ok(failedFunction.evidence.some(text => /Docker API logs/.test(text)));

console.log("TNND Web self-diagnostic checks passed.");
