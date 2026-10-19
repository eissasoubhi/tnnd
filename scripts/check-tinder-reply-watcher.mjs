import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { presentWatcherStatus } from "../src/tinder-watcher-popup-status.ts";
import {
  reconcileExistingIndex, markThreadChecked, observeUnreadThreads
} from "../src/tinder-existing-thread-index.ts";
import {
  nextWatchedReply, pendingWatchedReplies, watcherDisplayStatus, newlyVisibleUnread
} from "../src/tinder-reply-watcher.ts";
import {
  followConversationAfterSignal, shouldKeepConversationInFocus
} from "../src/tinder-conversation-activity.ts";

const base = "2026-10-14T19:00:00Z";
const source = (ref, direction = "outgoing", at = base) => ({
  ref, lastMessageAt: at, lastMessageDirection: direction
});
test("watcher does not sweep answered or unknown threads on initial launch",()=>{
  const work=reconcileExistingIndex(null,"one",[
    source("already-answered"), source("unknown",null), source("new-reply","incoming")
  ],"2026-10-14T19:01:00Z");
  assert.equal(nextWatchedReply(work),"new-reply");
  assert.equal(pendingWatchedReplies(work),1);
  const checked=markThreadChecked(work,"new-reply","2026-10-14T19:02:00Z");
  assert.equal(nextWatchedReply(checked),null);
  assert.equal(pendingWatchedReplies(checked),0);
  const restarted=reconcileExistingIndex(checked,"one",[
    source("already-answered"),source("unknown",null),source("new-reply","incoming")
  ],"2026-10-14T20:05:00Z");
  assert.equal(nextWatchedReply(restarted),null,"no replay of a previously checked version after restart");
});
test("new incoming synced version requeues exactly that thread once",()=>{
  let queue=reconcileExistingIndex(null,"one",[source("a","incoming"),source("b","outgoing")]);
  queue=markThreadChecked(queue,"a");
  queue=reconcileExistingIndex(queue,"one",[
    source("a","incoming","2026-10-14T19:20:00Z"),source("b","outgoing")
  ],"2026-10-14T19:21:00Z");
  assert.equal(nextWatchedReply(queue),"a");
  queue=markThreadChecked(queue,"a");
  assert.equal(nextWatchedReply(queue),null);
});
test("visible unread is higher priority even while backend latest is outgoing",()=>{
  let queue=reconcileExistingIndex(null,"one",[
    source("a","incoming"),source("b","outgoing")
  ],base);
  queue=observeUnreadThreads(queue,["b"],"2026-10-14T19:01:00Z");
  assert.equal(nextWatchedReply(queue),"b");
  queue=markThreadChecked(queue,"b","2026-10-14T19:02:00Z");
  assert.equal(nextWatchedReply(queue),"a");
  queue=observeUnreadThreads(queue,["b"],"2026-10-14T19:02:30Z");
  assert.equal(nextWatchedReply(queue),"a","a lingering badge cannot requeue during cooldown");
});
test("account isolation, disabled or unauthorized refs cannot leak into watcher",()=>{
  const one=reconcileExistingIndex(null,"one",[source("a","incoming")]);
  assert.equal(nextWatchedReply(one),"a");
  const two=reconcileExistingIndex(one,"two",[source("b","outgoing")]);
  assert.equal(nextWatchedReply(two),null);
  assert.deepEqual(two.threads.map(t=>t.ref),["b"]);
  assert.equal(pendingWatchedReplies(two),0);
  const hints=observeUnreadThreads(two,["a","missing"]);
  assert.equal(nextWatchedReply(hints),null,"unapproved refs aren't added by a DOM hint");
});
test("watcher status distinguishes waiting, new replies, processing, paused and disconnected",()=>{
  const state = { enabled:true,pausedOnStop:false,phase:"waiting",phaseDetail:"Watching",pendingReplies:0 };
  assert.equal(watcherDisplayStatus(state),"waiting");
  assert.equal(watcherDisplayStatus({...state,pendingReplies:1}),"new-replies");
  assert.equal(watcherDisplayStatus({...state,phase:"sending"}),"processing");
  assert.equal(watcherDisplayStatus({...state,enabled:false,pausedOnStop:true}),"paused");
  assert.equal(watcherDisplayStatus({...state,enabled:false,phase:"error",phaseDetail:"Receiving end does not exist / receiver missing"}),"disconnected");
});
test("popup starts a separate watch mode; content scan does not expose private message text",async()=>{
 const read = path => readFile(new URL("../"+path,import.meta.url),"utf8");
 const [runner,content,popup,html] = await Promise.all([
   "src/tinder-global-existing-runner.ts","src/content.ts",
   "src/popup.ts","public/popup.html"
 ].map(read));
 assert.match(runner,/TNND_GLOBAL_WATCHER_START/);
 assert.match(runner,/startExistingRunner\(false, "watcher"\)/);
 assert.match(runner,/nextWatchedReply\(queued\)/);
 assert.match(runner,/pendingWatchedReplies\(queued\)/);
 assert.match(runner,/chrome\.alarms\.onAlarm/);
 assert.match(runner,/chrome\.runtime\.onStartup/);
 assert.match(runner,/void tick\(\)/);
 assert.match(runner,/mode === "watcher" && enablePreviouslyDisabled/);
 assert.match(runner,/getBackendSession\(\)/);
 assert.match(content,/TNND_WATCHER_READ_UNREAD/);
 assert.match(content,/discoverUnreadThreadCandidates\(\)/);
 assert.match(content,/type: "TNND_EXISTING_RUNNER_UNREAD"/);
 assert.match(popup,/startReplyWatcher.*addEventListener\("click"/);
 assert.match(popup,/stopReplyWatcher.*addEventListener\("click"/);
 assert.match(html,/id="replyWatcherStatus" role="status" aria-live="polite"/);
 assert.match(html,/id="startReplyWatcher"/);
 assert.match(html,/id="stopReplyWatcher"/);
 assert.doesNotMatch(runner,/adapter\.send|GENERATE_SUGGESTIONS/);
});

test("lingering unread badge is not treated as a new reply on every poll",()=>{
 assert.deepEqual(newlyVisibleUnread([],["a","b","a"]),["a","b"]);
 assert.deepEqual(newlyVisibleUnread(["a"],["a","b"]),["b"]);
 assert.deepEqual(newlyVisibleUnread(["a","b"],["b","a"]),[]);
 assert.deepEqual(newlyVisibleUnread(["a"],[]),[]);
 // Once Tinder removes the badge, a later new unread hint may be processed.
 assert.deepEqual(newlyVisibleUnread([],["a"]),["a"]);
});
test("watcher keeps bounded observed unread list after worker restart",async()=>{
 const runner=await readFile(new URL("../src/tinder-global-existing-runner.ts",import.meta.url),"utf8");
 assert.match(runner,/visibleUnreadRefs: Array\.isArray/);
 assert.match(runner,/newlyVisibleUnread\(currentState\.visibleUnreadRefs, visible\)/);
 assert.match(runner,/newlyVisibleUnread\(state\.visibleUnreadRefs, visible\)/);
 assert.match(runner,/await chrome\.alarms\.create\(ALARM/);
 assert.match(runner,/chrome\.runtime\.onStartup\.addListener/);
});

test("watcher keeps an active chat only while its measured attention window lasts",()=>{
  const at=Date.parse("2026-10-14T20:00:00Z");
  let work=reconcileExistingIndex(null,"user",[
    source("active","incoming","2026-10-14T19:59:00Z"),
    source("waiting","incoming","2026-10-14T19:59:15Z")
  ],"2026-10-14T20:00:00Z");
  work=markThreadChecked(work,"active","2026-10-14T20:00:00Z");
  assert.equal(nextWatchedReply(work),"waiting");
  const opened=followConversationAfterSignal({
    activeConversationRef:null, activeConversationUntil:null, conversationActivities:[]
  },"active","opened","2026-10-14T20:00:00Z");
  assert.equal(shouldKeepConversationInFocus(opened,"active",["active","waiting"],at+1000),true);
  assert.equal(shouldKeepConversationInFocus(opened,"active",["active","waiting"],at+3000),false,
    "Opening a previously active chat does not imply three minutes of online activity");
  assert.equal(nextWatchedReply(work),"waiting","other matches remain queued");
});
test("adaptive focus cannot hijack a different, disabled or manually switched chat",()=>{
  const follow=followConversationAfterSignal({
    activeConversationRef:null, activeConversationUntil:null, conversationActivities:[]
  },"active","incoming","2026-10-14T20:00:00Z");
  const at=Date.parse("2026-10-14T20:00:00Z")+1000;
  assert.equal(shouldKeepConversationInFocus(follow,"other",["active","other"],at),false);
  assert.equal(shouldKeepConversationInFocus(follow,"active",["other"],at),false);
  assert.equal(shouldKeepConversationInFocus({...follow,activeConversationUntil:"invalid"},"active",["active"],at),false);
  assert.equal(shouldKeepConversationInFocus({...follow,activeConversationRef:null},"active",["active"],at),false);
});
test("watcher extends focus after distinct incoming/sent events, not an old processed bubble",async()=>{
  const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
  const [runner,content,popup,manifest]=await Promise.all([
    "src/tinder-global-existing-runner.ts","src/content.ts","src/popup.ts","public/manifest.json"
  ].map(read));
  assert.match(runner,/mode === "watcher" && state\.matchPhase === "idle" && state\.tabId !== null && state\.activeConversationRef/);
  assert.match(runner,/shouldKeepConversationInFocus\(state,/);
  assert.match(runner,/shouldKeepConversationInFocus\(beforeNavigation, expectedRef, refs\)/);
  assert.match(runner,/followConversationAfterSignal\(latest, nextRef, "opened"\)/);
  assert.match(runner,/followConversationAfterSignal\(next, activeRef, "opened"\)/);
  assert.match(runner,/phase === "incoming" \|\| phase === "sent"/);
  assert.match(content,/lastWatchedIncomingEvidence\.get\(conversationRef\) !== incomingEvidence/);
  assert.match(content,/reportExistingRunner\("incoming", "New reply in the current conversation\."\)/);
  assert.match(content,/phase !== "sent" && phase !== "incoming"/);
  const watcherPopupStatus = await readFile(new URL("../src/tinder-watcher-popup-status.ts", import.meta.url), "utf8");
  assert.match(watcherPopupStatus,/Following current conversation/);
  assert.equal(JSON.parse(manifest).version,"0.2.25");
});

test("watcher Start error is not replaced by stopped during a status refresh", () => {
  const stopped = { enabled: false, mode: "runner", phase: "stopped",
    phaseDetail: "Runner stopped.", watcherStatus: "stopped" };
  const error = "Stop Smart Swipe before starting another Tinder runner.";
  const rejected = presentWatcherStatus(stopped, error, null);
  assert.match(rejected.label, /Watcher action failed/);
  assert.match(rejected.label, /Stop Smart Swipe/);
  assert.equal(rejected.status, "stopped");
  assert.equal(presentWatcherStatus(stopped, null, null).label, "Stopped · watcher is off");
  assert.match(presentWatcherStatus({ ...stopped, enabled: true, mode: "runner" }, null, null).label,
    /Full-chat runner active/);
});

test("watcher confirms running state and clearly reports worker or configuration problems", () => {
  const active = { enabled: true, mode: "watcher", phase: "waiting",
    phaseDetail: "Watching 3 eligible chats", watcherStatus: "waiting" };
  const announced = presentWatcherStatus(active, null,
    "Watcher started, no automatic first messages.");
  assert.match(announced.label, /Watcher started/);
  assert.match(announced.label, /Waiting for replies/);
  const stoppedByError = presentWatcherStatus({ ...active, enabled: false, phase: "error",
    pausedOnStop: true, phaseDetail: "Tinder content bridge disconnected after reload" }, null, null);
  assert.match(stoppedByError.label, /content bridge disconnected/);
  assert.equal(stoppedByError.status, "paused");
  const retrying = presentWatcherStatus({ ...active, phase: "error",
    phaseDetail: "Network unavailable, retrying." }, null, null);
  assert.match(retrying.label, /Network unavailable/);
  assert.equal(retrying.status, "paused");
  const missingSetting = presentWatcherStatus({ ...active,
    phaseDetail: "Automatic replies are OFF in TNND Options. Enable them to continue." },
    null, null);
  assert.match(missingSetting.label, /Enable them to continue/);
  assert.ok(presentWatcherStatus(active, "X".repeat(1000), null).label.length <= 390);
});

test("watcher buttons require worker confirmation and preserve rejected commands", async () => {
  const popup = await readFile(new URL("../src/popup.ts", import.meta.url), "utf8");
  assert.match(popup, /watcherUiError = reason/);
  assert.match(popup, /runWatcherPopupCommand\("TNND_GLOBAL_WATCHER_START"/);
  assert.match(popup, /if \(!response\.state\) throw new Error/);
  assert.match(popup, /response\.state\.enabled && response\.state\.mode === "watcher"/);
  assert.match(popup, /A read-only status refresh cannot erase the saved command failure/);
  assert.match(popup, /presentWatcherStatus\(state, watcherUiError, watcherUiNotice\)/);
  const html = await readFile(new URL("../public/popup.html", import.meta.url), "utf8");
  assert.match(html, /id="replyWatcherControlFeedback"[^>]*aria-live="polite"/);
  assert.match(popup, /if \(controlFeedback\) controlFeedback.textContent = "Cannot start watcher: " \+ reason/);
});
