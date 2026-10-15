import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
const root = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(resolve(root,name),"utf8");
const identity = read("identity-builder-panel.ts");
const analytics = read("analytics-dashboard-mount.ts");
const renderer = read("analytics-dashboard-renderer.ts");
const css = read("neo-bento.css");
test("Identity Builder clears the previous account and rejects late fetch/approve/analyze", () => {
  assert.match(identity,/displayedSessionToken/);
  assert.match(identity,/source\.value = ""/);
  assert.match(identity,/isLatestSessionResponse\(requestId, loadSequence, session\.token, readSession\(\)\?\.token\)/);
  assert.match(identity,/if \(readSession\(\)\?\.token !== session\.token\) return/);
  assert.match(identity,/render\(approved\)/);
});
test("analytics cannot replace new session state with a stale successful API response", () => {
  assert.match(analytics,/analyticsRequests = new WeakMap/);
  assert.match(analytics,/isLatestSessionResponse\(requestId, analyticsRequests\.get\(container\) \?\? 0, session\.token, readSession\(\)\?\.token\)/);
  assert.match(analytics,/stale-request/);
  assert.match(read("analytics-panel.ts"),/requestId !== latestRefresh/);
});
test("analytics prioritizes essential counts, preserves detail, labels snapshot truthfully", () => {
  assert.match(renderer,/View the other conversation statuses/);
  assert.match(renderer,/Key conversation status counts/);
  assert.match(renderer,/Last verified snapshot:/);
  assert.match(renderer,/not live Tinder activity/);
  assert.match(css,/#app \.analytics-dashboard \.analytics-status-grid/);
  assert.match(css, /max-width: 390px/);
});
