import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  emptyWatchedMatches, observeWatchedMatches, watchedMatchCounts, isWatchedMatches
} from "../src/tinder-match-watcher.ts";

test("first visible Tinder Matches view is an existing baseline, never a future match send", () => {
  let state=emptyWatchedMatches("user-1");
  assert.equal(state.baselineReady,false);
  state=observeWatchedMatches(state,["old-A","old-B"],"2026-10-14T20:00:00Z");
  assert.deepEqual(state.existingRefs,["old-A","old-B"]);
  assert.deepEqual(state.newRefs,[]);
  assert.equal(state.observer.autoSendEnabled,false);
  assert.deepEqual(watchedMatchCounts(state),{existing:2,new:0,pending:0});
});
test("new top-of-list match requires two observations and at least 15 seconds",()=>{
  let state=observeWatchedMatches(emptyWatchedMatches("u"),["old-A","old-B"],"2026-10-14T20:00:00Z");
  state=observeWatchedMatches(state,["fresh-A","old-A","old-B"],"2026-10-14T20:00:05Z");
  assert.deepEqual(state.newRefs,[]);
  assert.equal(watchedMatchCounts(state).pending,1);
  state=observeWatchedMatches(state,["fresh-A","old-A","old-B"],"2026-10-14T20:00:25Z");
  assert.deepEqual(state.newRefs,["fresh-A"]);
  assert.deepEqual(state.existingRefs,["old-A","old-B"]);
  assert.equal(state.observer.autoSendEnabled,false);
  state=observeWatchedMatches(state,["fresh-A","old-A","old-B"],"2026-10-14T20:01:00Z");
  assert.deepEqual(state.newRefs,["fresh-A"],"do not reclassify or replay confirmed matches");
  assert.equal(isWatchedMatches(state,"u"),true);
  assert.equal(isWatchedMatches(state,"other"),false);
});
test("lazy loaded old tiles stay existing, not falsely new",()=>{
  let state=observeWatchedMatches(emptyWatchedMatches("user"),["old-A","old-B"],"2026-10-14T20:00:00Z");
  state=observeWatchedMatches(state,["old-A","old-B","older-C"],"2026-10-14T20:00:15Z");
  assert.deepEqual(state.newRefs,[]);
  assert.deepEqual(state.existingRefs,["old-A","old-B","older-C"]);
});
test("empty, malformed and unrelated snippets never create or erase matches",()=>{
  let state=observeWatchedMatches(emptyWatchedMatches("user"),["old-A","old-B"],"2026-10-14T20:00:00Z");
  const original=state;
  assert.equal(observeWatchedMatches(state,[], "2026-10-14T20:00:10Z"),original);
  state=observeWatchedMatches(state,["/app/messages/not-a-ref","old-A","old-B",null],"2026-10-14T20:00:20Z");
  assert.deepEqual(state.newRefs,[]);
  assert.deepEqual(state.existingRefs,["old-A","old-B"]);
  assert.equal(state.observer.autoSendEnabled,false);
});
test("watch mode allows zero managed conversations and read-only match inventory after restart",async()=>{
  const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
  const [runner,content,html,popup,newMatchBackground]=await Promise.all([
    "src/tinder-global-existing-runner.ts","src/content.ts","public/popup.html",
    "src/popup.ts","src/tinder-new-match-background.ts"
  ].map(read));
  assert.match(runner,/mode !== "watcher" && !selection\.refs\.length/);
  assert.match(runner,/TNND_WATCHER_MATCHES_SEEN/);
  assert.match(runner,/emptyWatchedMatches\(session\.user\.id\)/);
  assert.match(runner,/isWatchedMatches\(value\.watchedMatches, value\.userId\)/);
  assert.match(runner,/pendingStateWrite/);
  assert.match(runner,/sender\.tab\?\.id !== state\.tabId/);
  assert.match(content,/detectVisibleTinderSidebarTab\(\) !== "matches"/);
  assert.match(content,/TNND_WATCHER_READ_MATCHES/);
  assert.match(content,/type: "TNND_WATCHER_MATCHES_SEEN"/);
  assert.match(popup,/matches\.existingRefs\.length/);
  assert.match(popup,/matches\.newRefs\.length/);
  assert.match(html,/id="replyWatcherMatches"/);
  assert.match(newMatchBackground,/Global existing chats are running/);
  assert.doesNotMatch(runner,/TNND_AUTO_START_NEW_MATCH|adapter\.send\(/);
});
