import assert from "node:assert/strict";
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
console.log("Smart Swipe single tab/owner/runner safety gates passed.");
