import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  armExistingMatches, armNewMatchObservation, observeNewMatchLinks, finishNewMatchAttempt, emptyNewMatchState
} from "../src/tinder-new-match-observation.ts";

test("existing Tinder matches may be explicitly queued, while future-match baseline remains untouched",()=>{
 const current=armExistingMatches(["srim","nawal","srim"],"user-a");
 assert.equal(current.mode,"existing");
 assert.deepEqual(current.pendingRefs,["srim","nawal"]);
 assert.deepEqual(current.seenRefs,["srim","nawal"]);
 assert.deepEqual(observeNewMatchLinks(current,["future","srim","nawal"]).pendingRefs,["srim","nawal"]);
 const future=armNewMatchObservation(["srim","nawal"],"user-a");
 assert.equal(future.mode,"future");
 assert.deepEqual(future.pendingRefs,[]);
});
test("never automatically retry a sent or uncertain existing match message on restart",()=>{
 let state=armExistingMatches(["srim","nawal"],"user-a");
 state=finishNewMatchAttempt(state,"srim",true,"sent");
 state=finishNewMatchAttempt(state,"nawal",false,"unknown");
 const restarted=armExistingMatches(["nawal","srim","youssra"],"user-a",state);
 assert.deepEqual(restarted.pendingRefs,["youssra"]);
 const other=armExistingMatches(["srim"],"other-user",state);
 assert.deepEqual(other.pendingRefs,["srim"]);
});
test("existing-match worker reuses one tab, checks empty thread and honors first-message gate",async()=>{
 const runner=await readFile(new URL("../src/tinder-global-new-match-runner.ts",import.meta.url),"utf8");
 const content=await readFile(new URL("../src/content.ts",import.meta.url),"utf8");
 const background=await readFile(new URL("../src/tinder-new-match-background.ts",import.meta.url),"utf8");
 const popup=await readFile(new URL("../src/popup.ts",import.meta.url),"utf8");
 const html=await readFile(new URL("../public/popup.html",import.meta.url),"utf8");
 assert.match(runner,/TNND_MATCH_SPA_NAVIGATE/);
 assert.doesNotMatch(runner,/chrome\.tabs\.create\(|chrome\.tabs\.update\(|chrome\.tabs\.remove\(/);
 assert.match(runner,/conversation\.messages\.length > 0/);
 assert.match(runner,/newMatchSendPermission\(ref, tabId\)/);
 assert.match(runner,/TNND_AUTO_START_NEW_MATCH/);
 assert.match(runner,/firstMessageDailyLimit\(config\.automation\.maxFirstMessagesPerDay\)/);
 assert.match(runner,/startExistingRunner\(\)/);
 assert.match(runner,/dwellSeconds/);
 assert.match(content,/matches_tab_not_accessible/);
 assert.match(content,/match_tile_not_loaded/);
 assert.match(content,/a\.matchListItem/);
 assert.match(background,/TNND_EXISTING_MATCHES_START/);
 assert.match(background,/armExistingMatches\(message\.refs, session\.user\.id, recovery\.prior\)/);
 assert.match(background,/recoverVerifiedPreSendFailures\(prior, durable, processed\)/);
 assert.match(popup,/startExistingMatchBatch/);
 assert.match(popup,/TNND_EXISTING_MATCHES_START/);
 assert.match(html,/startExistingMatchBatch/);
});
