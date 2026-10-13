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

test("the scheduler navigates a user-confirmed dedicated tab, not unrelated Tinder chats", async () => {
 const { readFile }=await import("node:fs/promises");
 const runner=await readFile(new URL("../src/tinder-global-existing-runner.ts",import.meta.url),"utf8");
 const popup=await readFile(new URL("../src/popup.ts",import.meta.url),"utf8");
 assert.match(runner,/chrome\.alarms\.onAlarm/);
 assert.match(runner,/chrome\.tabs\.create\(/);
 assert.match(runner,/active: false/);
 assert.match(runner,/chrome\.tabs\.update\(/);
 assert.match(runner,/eligibleExistingThreadRefs/);
 assert.match(runner,/chrome\.alarms\.clear/);
 assert.doesNotMatch(runner,/adapter\.send|GENERATE_SUGGESTIONS/);
 assert.match(popup,/startGlobalExisting\.addEventListener\("click"/);
 assert.match(popup,/stopGlobalExisting\.addEventListener\("click"/);
 assert.match(popup,/window\.confirm\("Start a dedicated background Tinder tab/);
});
