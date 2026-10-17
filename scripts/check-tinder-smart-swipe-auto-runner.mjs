import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideAutoSwipeDrive } from "../src/tinder-smart-swipe-auto-runner-policy.ts";
const ready = {
 armed:true,settingsEnabled:true,authenticated:true,oneTinderTab:true,
 selectedTabMatches:true,userOwnsTab:true,existingRunnerEnabled:false,
 newMatchRunnerEnabled:false,userTakeover:false
};
assert.equal(decideAutoSwipeDrive(ready), "allowed");
for(const [field,reason] of [
 ["armed","not_armed"],["settingsEnabled","disabled"],["authenticated","not_signed_in"],
 ["oneTinderTab","multiple_tinder_tabs"],["selectedTabMatches","tab_changed"],
 ["userOwnsTab","account_mismatch"]
]) assert.equal(decideAutoSwipeDrive({...ready,[field]:false}),reason);
for(const [field,reason] of [
 ["existingRunnerEnabled","existing_runner_active"],
 ["newMatchRunnerEnabled","new_match_runner_active"],["userTakeover","user_takeover"]
]) assert.equal(decideAutoSwipeDrive({...ready,[field]:true}),reason);
const background = readFileSync(new URL("../src/tinder-smart-swipe-automation-background.ts", import.meta.url), "utf8");
assert.ok(background.includes('sender.url !== `chrome-extension://${chrome.runtime.id}/popup.html`'),
  "the popup origin must interpolate the live extension ID");
assert.ok(!background.includes('chrome-extension://\\${chrome.runtime.id}'),
  "an escaped template interpolation would block Start and Stop");
console.log("Smart Swipe single tab/owner/runner safety gates passed.");
