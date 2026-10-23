import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  nextWatcherMatchAction, nextMatchOpener, hasUnattemptedVisibleMatches,
  WATCHER_MATCH_SCAN_INTERVAL_MS, WATCHER_MATCH_VERIFICATION_MS
} from "../src/tinder-watcher-match-cycle.ts";

const t=Date.parse("2026-10-15T12:00:00Z");
const base={matchPhase:"idle",lastMatchScanAt:null,lastIncomingAt:null,matchPhaseStartedAt:null,autoOpenersEnabled:true};
const idle={activeFollow:false,pendingReplies:0,replyProcessing:false,now:t};
test("no scanning or opener while live conversation/reply is active",()=>{
  assert.equal(nextWatcherMatchAction(base,{...idle,activeFollow:true}),"none");
  assert.equal(nextWatcherMatchAction(base,{...idle,pendingReplies:1}),"none");
  assert.equal(nextWatcherMatchAction(base,{...idle,replyProcessing:true}),"none");
  assert.equal(nextWatcherMatchAction(base,idle),"scan");
  assert.equal(WATCHER_MATCH_SCAN_INTERVAL_MS,300000);
});
test("5 minutes measured from the last NEW incoming reply, not merely the previous scan",()=>{
 const state={...base,lastMatchScanAt:new Date(t-450000).toISOString(),
   lastIncomingAt:new Date(t-240000).toISOString()};
 assert.equal(nextWatcherMatchAction(state,idle),"none");
 assert.equal(nextWatcherMatchAction(state,{...idle,now:t+59999}),"none");
 assert.equal(nextWatcherMatchAction(state,{...idle,now:t+600000}),"scan");
});
test("brief Matches visit, two confirmed observations, recover when reply arrives mid-scan",()=>{
 const verifying={...base,matchPhase:"verifying",matchPhaseStartedAt:new Date(t).toISOString(),lastMatchScanAt:new Date(t).toISOString()};
 assert.equal(nextWatcherMatchAction(verifying,{...idle,now:t+14000}),"none");
 assert.equal(WATCHER_MATCH_VERIFICATION_MS,16000);
 assert.equal(nextWatcherMatchAction(verifying,{...idle,now:t+17000}),"verify");
 assert.equal(nextWatcherMatchAction(verifying,{...idle,now:t+8000,pendingReplies:1}),"recover");
 assert.equal(nextWatcherMatchAction({...verifying,lastIncomingAt:new Date(t+3000).toISOString()}, {...idle,now:t+5000}),"recover");
 assert.equal(nextWatcherMatchAction(verifying,{...idle,now:t+70000}),"recover");
 assert.equal(nextWatcherMatchAction({...verifying,matchPhase:"opener"},{...idle,now:t+5000}),"none");
 assert.equal(nextWatcherMatchAction({...verifying,matchPhase:"opener"},{...idle,now:t+200000}),"recover");
});
test("new verified matches go first, already attempted or invalid refs never replay",()=>{
 assert.equal(nextMatchOpener(["existing-1","existing-2"],["new-1"],[]),"new-1");
 assert.equal(nextMatchOpener(["existing-1","existing-2"],["new-1"],["new-1"]),"existing-1");
 assert.equal(nextMatchOpener(["existing-1"],["new-1"],["new-1","existing-1"]),null);
 assert.equal(nextMatchOpener(["/bad"],["!bad"],[]),null);
});
test("when last new-match opener is durably claimed, release match-first priority to chats", () => {
  const older = ["match-old-1", "match-old-2"];
  const newer = ["match-new-1"];
  const visible = [...newer, ...older];
  assert.equal(hasUnattemptedVisibleMatches(older, newer, visible, []), true);
  assert.equal(hasUnattemptedVisibleMatches(older, newer, visible, ["match-new-1"]), true,
    "Still prefer remaining verified matches after one opener");
  assert.equal(hasUnattemptedVisibleMatches(older, newer, visible,
    ["match-new-1", "match-old-1", "match-old-2"]), false,
    "Once every observed match was attempted, switch to waiting chats");
  assert.equal(hasUnattemptedVisibleMatches(older, newer, [],
    ["match-new-1"]), false, "Offscreen matches are not proof of current safe availability");
  assert.equal(hasUnattemptedVisibleMatches(["!invalid"], [], ["!invalid"], []), false);
});
test("quota-triggered match-first watcher drains only eligible first messages before ordinary queued chats", async () => {
  const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts", import.meta.url), "utf8");
  const unified = await readFile(new URL("../src/unified-controller-background.ts", import.meta.url), "utf8");
  assert.match(runner, /preferUnstartedMatches: mode === "watcher" && autoOpenersEnabled && preferUnstartedMatches/);
  assert.match(runner, /state\.mode === "watcher" && state\.preferUnstartedMatches/);
  assert.match(runner, /await scanMatchesCycle\(\{ \.\.\.current, pendingReplies \}\)/);
  assert.match(runner, /preferUnstartedMatches: live\.preferUnstartedMatches && \(!matchesExhausted \|\| live\.manualActivity === "new-match"\)/);
  assert.match(runner, /const stillPending = hasUnattemptedVisibleMatches\(/);
  assert.match(runner, /!stillPending\);/);
  for (const message of [
    "No eligible unattempted match tiles", "Daily first-message quota",
    "first messages are not enabled", "Match already attempted"
  ]) {
    const at = runner.indexOf(message);
    assert.ok(at >= 0, "Missing chat fallback for " + message);
    const line = runner.slice(at, runner.indexOf("\n", at));
    assert.match(line, /true\);/, "Completed Matches phase must advance to waiting chats");
  }
  assert.match(unified, /await stopUnifiedSwipe\(\)/);
  assert.match(unified, /const second = await readReachedLimits\(\)/);
  assert.match(unified, /startExistingRunner\(false, "watcher", true, true\)/);
  assert.match(unified, /epoch !== commandEpoch/);
});

test("one-tab guarded round-trip and shared daily send journal remain enforced",async()=>{
 const rd=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
 const [runner,content,newRunner,newPermission,popup,html]=await Promise.all([
   "src/tinder-global-existing-runner.ts","src/content.ts",
   "src/tinder-global-new-match-runner.ts","src/tinder-new-match-background.ts",
   "src/popup.ts","public/popup.html"
 ].map(rd));
 assert.match(runner,/TNND_GLOBAL_WATCHER_AUTO_START/);
 assert.match(runner,/autoOpenersEnabled/);
 assert.match(runner,/lastIncomingAt/);
 assert.match(runner,/scanMatchesCycle/);
 assert.match(runner,/nextWatchedReply\(queued\)/);
 assert.match(runner,/pendingWatchedReplies\(work\) > 0/);
 assert.match(runner,/claimWatchedOpener/);
 assert.match(runner,/sendSingleWatchedMatch/);
 assert.match(runner,/returnWatcherToMessages/);
 assert.match(runner,/new Set\(snapshot\.refs\.filter/);
 assert.match(runner,/chrome\.alarms\.clear\(ALARM\)/);
 assert.match(content,/TNND_WATCHER_SELECT_SIDEBAR/);
 assert.match(content,/conversation_processing_in_progress/);
 assert.match(content,/unsent_message_draft_present/);
 assert.match(content,/sidebar_switch_not_confirmed/);
 assert.match(newRunner,/newMatchSendPermission\(ref, tabId\)/);
 assert.match(newRunner,/hasReachedFirstMessageDailyLimit/);
 assert.match(newRunner,/await prepareNewMatch/);
 assert.match(newRunner,/TNND_AUTO_START_NEW_MATCH/);
 assert.match(newRunner,/newMatchDailyAttempts/);
 assert.match(newRunner,/mode: "watcher" as const/);
 assert.match(newRunner,/await saveNewMatchState\(current\)/);
 assert.match(newPermission,/watcher\.matchPhase !== "opener"/);
 assert.match(popup,/startAutoMatchWatcher/);
 assert.match(popup,/window\.confirm\(/);
 assert.match(html,/id="replyWatcherAutoStatus"/);
 assert.match(html,/id="startAutoMatchWatcher"/);
});
