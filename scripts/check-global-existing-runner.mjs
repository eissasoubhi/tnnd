import assert from "node:assert/strict";
import test from "node:test";
import { eligibleExistingThreadRefs, nextExistingThreadRef } from "../src/tinder-global-existing-policy.ts";

const item = (id, managementState="ai-managed", explicitlySelected=true) => ({
 id, externalThreadId:id, managementState, explicitlySelected
});
const summary = (id,status="active",lastMessageAt="2026-10-13T12:00:00Z",pendingHumanActions=0) => ({
 id,status,lastMessageAt,pendingHumanActions
});

test("global navigation visits only confirmed AI-managed existing chats", () => {
 const refs=eligibleExistingThreadRefs([
 item("ready"),item("manual","manual"),item("unmanaged","unmanaged"),
 item("not-confirmed","ai-managed",false),item("blocked"),item("waiting"),item("paused"),
 item("no-history"),item("bad/path"),item("other-ready")
 ], [
 summary("ready"),summary("manual"),summary("unmanaged"),summary("not-confirmed"),
 summary("blocked","action-required"),summary("waiting","waiting-for-user"),summary("paused","paused"),
 summary("no-history","active",null),summary("bad/path"),summary("other-ready","waiting-for-them")
 ]);
 assert.deepEqual(refs,["ready","other-ready"]);
 assert.equal(nextExistingThreadRef(refs,null),"ready");
 assert.equal(nextExistingThreadRef(refs,"ready"),"other-ready");
 assert.equal(nextExistingThreadRef(refs,"other-ready"),"ready");
 assert.equal(nextExistingThreadRef([],null),null);
});

test("the runner reuses the sole existing Tinder tab and never closes user tabs", async () => {
 const { readFile } = await import("node:fs/promises");
 const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts", import.meta.url), "utf8");
 const popup = await readFile(new URL("../src/popup.ts", import.meta.url), "utf8");
 assert.match(runner, /chrome\.tabs\.query\(/);
 assert.match(runner, /tinder\.com\/\*/);
 assert.match(runner, /tinder\.length > 1/);
 assert.match(runner, /mode: "reused"/);
 assert.match(runner, /chrome\.tabs\.create\(/);
 assert.match(runner, /active: true/);
 assert.match(runner, /chrome\.tabs\.update\(/);
 assert.doesNotMatch(runner, /chrome\.tabs\.remove\(/);
 assert.match(runner, /eligibleExistingThreadRefs/);
 assert.match(runner, /chrome\.alarms\.clear/);
 assert.match(runner, /tnnd\.newMatchLinkObservation\.v3/);
 assert.doesNotMatch(runner, /adapter\.send|GENERATE_SUGGESTIONS/);
 assert.match(popup, /startGlobalExisting\.addEventListener\("click"/);
 assert.match(popup, /stopGlobalExisting\.addEventListener\("click"/);
 assert.match(popup, /window\.confirm\("Use your EXISTING Tinder tab/);
});

test("operational runner states are persisted and reported without Tinder message contents", async () => {
 const { readFile } = await import("node:fs/promises");
 const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts", import.meta.url), "utf8");
 const content = await readFile(new URL("../src/content.ts", import.meta.url), "utf8");
 const popup = await readFile(new URL("../src/popup.ts", import.meta.url), "utf8");
 const html = await readFile(new URL("../public/popup.html", import.meta.url), "utf8");
 const bridge = await readFile(new URL("../src/web-diagnostic-bridge.ts", import.meta.url), "utf8");
 const panel = await readFile(new URL("../apps/web/src/conversation-management-panel.ts", import.meta.url), "utf8");
 assert.match(runner, /LOG_LIMIT = 16/);
 assert.match(runner, /lastActionAt/);
 assert.match(runner, /visitedCount/);
 assert.match(runner, /sentCount/);
 assert.match(runner, /TNND_EXISTING_RUNNER_EVENT/);
 assert.match(runner, /pausedOnStop/);
 assert.match(runner, /TNND_EXISTING_RUNNER_TAB_PAUSED/);
 assert.match(runner, /TNND_EXISTING_RUNNER_CLEAR_PAUSE/);
 assert.match(content, /await autoReplyPausedAfterGlobalStop\(conversationRef\)/);
 assert.match(popup, /TNND_EXISTING_RUNNER_CLEAR_PAUSE/);
 assert.match(runner, /sender\.tab\.id !== state\.tabId/);
 assert.match(runner, /webReadOnlySender/);
 for (const phase of ["waiting", "generating", "sending", "sent", "skipped", "error"]) {
   assert.ok(content.includes(`reportExistingRunner("${phase}"`), phase);
 }
 assert.match(popup, /setInterval/);
 assert.match(popup, /globalExistingActivity/);
 assert.match(html, /globalRunnerVisited/);
 assert.match(html, /focusGlobalExistingTab/);
 assert.match(bridge, /TNND_GLOBAL_RUNNER_STATUS_V1/);
 assert.match(panel, /TNND_GLOBAL_RUNNER_STATUS_V1/);
 assert.match(panel, /web-runner-phase/);
 assert.match(panel, /web-runner-sent/);
});
