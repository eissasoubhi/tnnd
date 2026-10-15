import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  cappedAttentionWaitMs, normalizeAttentionCapSeconds,
  validAttentionCapSeconds
} from "../src/tinder-attention-cap.ts";
import {
  followConversationAfterSignal, shouldKeepConversationInFocus
} from "../src/tinder-conversation-activity.ts";

const files = async (...paths) => Promise.all(paths.map(path =>
  readFile(new URL("../" + path, import.meta.url), "utf8")));

test("cap is bounded and defaults to the previously deployed three minutes", () => {
  assert.equal(normalizeAttentionCapSeconds(undefined), 180);
  assert.equal(normalizeAttentionCapSeconds(120), 120);
  assert.equal(normalizeAttentionCapSeconds(999), 180);
  assert.equal(validAttentionCapSeconds(600), true);
  assert.equal(validAttentionCapSeconds(17), false);
  assert.equal(cappedAttentionWaitMs(120000, 60, 30), 30000);
  assert.equal(cappedAttentionWaitMs(180000, 100, 600), 600000);
  assert.equal(cappedAttentionWaitMs(2000, 0, 600), 2000);
});

test("shorter cap changes the actual scheduler lease, not only Web display", () => {
  const time = "2026-10-16T19:00:00Z";
  const initial = { activeConversationRef:null, activeConversationUntil:null, conversationActivities:[], attentionCapSeconds:30 };
  let state = followConversationAfterSignal(initial, "a", "sent", time);
  state = followConversationAfterSignal(state, "a", "incoming", "2026-10-16T19:00:10Z");
  assert.equal(shouldKeepConversationInFocus(state,"a",["a"],Date.parse("2026-10-16T19:00:11Z")),true);
  assert.equal(shouldKeepConversationInFocus(state,"a",["a"],Date.parse("2026-10-16T19:00:41Z")),false);
});

test("Web bridge only forwards narrow, account-scoped read/save actions", async () => {
  const [runner, bridge, panel, nav, cap, styles] = await files(
    "src/tinder-global-existing-runner.ts",
    "src/web-diagnostic-bridge.ts",
    "apps/web/src/conversation-attention-panel.ts",
    "apps/web/src/main.ts",
    "src/tinder-attention-cap.ts",
    "apps/web/src/neo-bento.css"
  );
  assert.match(runner,/TNND_GLOBAL_ATTENTION_READ/);
  assert.match(runner,/TNND_GLOBAL_ATTENTION_SET_CAP/);
  assert.match(runner,/session\.user\.id !== input\.userId/);
  assert.match(runner,/sender\.frameId === 0/);
  assert.match(runner,/validAttentionCapSeconds\(input\.capSeconds\)/);
  assert.match(runner,/getAttentionCapSeconds\(value\.userId/);
  assert.match(runner,/attentionCapSeconds: await getAttentionCapSeconds\(session\.user\.id\)/);
  assert.match(bridge,/event\.source !== window \|\| event\.origin !== window\.location\.origin/);
  assert.match(bridge,/TNND_ATTENTION_WEB_REQUEST_V1/);
  assert.match(bridge,/TNND_ATTENTION_WEB_RESPONSE_V1/);
  assert.match(panel,/listConversationManagement\(session\)/);
  assert.match(panel,/readSession\(\)\?\.user\.id !== session\.user\.id/);
  assert.match(panel,/#attention-cap-form/);
  assert.match(nav,/href="#workspace-attention-section"/);
  assert.match(styles,/\.attention-dashboard/);
  assert.match(cap,/DEFAULT_ATTENTION_CAP_SECONDS = 180/);
  assert.doesNotMatch(panel,/chrome\.storage|chrome\.runtime|\.send\(/);
});
