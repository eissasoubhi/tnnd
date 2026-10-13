import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { classifyExistingMatchPreparation } from "../src/tinder-existing-match-preparation-policy.ts";

test("already explicitly AI-managed and active Tinder Matches are allowed without changing management",()=>{
 assert.deepEqual(classifyExistingMatchPreparation({
   status:"active",managementState:"ai-managed",explicitlySelected:true
 }),{kind:"reuse-ai-management"});
});

test("unselected unmanaged empty Tinder Matches may be enrolled after explicit global consent",()=>{
 assert.deepEqual(classifyExistingMatchPreparation({
   status:"active",managementState:"unmanaged",explicitlySelected:false
 }),{kind:"authorize-unmanaged"});
});

test("manual, archived, moved, not-confirmed and explicitly disabled matches never get silently reactivated",()=>{
 for (const [managementState, explicitlySelected] of [
   ["manual",true],["archived",true],["moved-off-tinder",true],
   ["ai-managed",false],["unmanaged",true],["manual",false]
 ]) {
   assert.equal(classifyExistingMatchPreparation({
     managementState,explicitlySelected,status:"active"
   }).kind,"blocked",managementState);
 }
 for (const status of [
   "paused","disabled","archived","action-required","waiting-for-user",
   "moved-off-tinder","stale","waiting-for-them",null
 ]) {
   assert.equal(classifyExistingMatchPreparation({
     status,managementState:"ai-managed",explicitlySelected:true
   }).kind,"blocked",String(status));
 }
});

test("first-message worker validates correct external thread, empty backend messages and reuses existing AI assignment",async()=>{
 const worker=await readFile(new URL("../src/tinder-global-new-match-runner.ts",import.meta.url),"utf8");
 assert.match(worker,/conversation\.externalThreadId !== ref/);
 assert.match(worker,/classifyExistingMatchPreparation\(conversation\)/);
 assert.match(worker,/decision\.kind === "blocked"/);
 assert.match(worker,/decision\.kind === "authorize-unmanaged"/);
 assert.match(worker,/detail\.data\.conversation\.messages\.length > 0/);
 assert.match(worker,/if \(needsAuthorization\)/);
 assert.doesNotMatch(worker,/PATCH", \{ status: "active" \}/);
 assert.match(worker,/newMatchSendPermission\(ref, tabId\)/);
 assert.match(worker,/TNND_AUTO_START_NEW_MATCH/);
 assert.match(worker,/tnnd\.newMatchDailyAttempts\.v1/);
});
