import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { presentWatcherStatus } from "../src/tinder-watcher-popup-status.ts";
import { chatReplyCountdownLabel } from "../src/chat-reply-countdown.ts";
import {
  reconcileExistingIndex, markThreadChecked, observeUnreadThreads
} from "../src/tinder-existing-thread-index.ts";
import {
  nextWatchedReply, watcherReplyPriority, pendingWatchedReplies, watcherDisplayStatus, newlyVisibleUnread
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
  const immediate=reconcileExistingIndex(checked,"one",[
    source("already-answered"),source("unknown",null),source("new-reply","incoming")
  ],"2026-10-14T19:03:00Z");
  assert.equal(nextWatchedReply(immediate),null,"do not re-visit within the cooldown");
  const retried=reconcileExistingIndex(immediate,"one",[
    source("already-answered"),source("unknown",null),source("new-reply","incoming")
  ],"2026-10-14T19:04:10Z");
  assert.equal(nextWatchedReply(retried),"new-reply","revisit still-incoming chat after brief cooldown; send gate retains deduplication");
});
test("Chat countdown is tied to observed next reply wait, not a fabricated delivery ETA",async()=>{
  const now=Date.parse("2026-11-03T09:00:00.000Z");
  const due="2026-11-03T09:01:04.000Z";
  assert.equal(chatReplyCountdownLabel({active:true,phase:"waiting",nextReplyAt:due},now),
    "Prochaine réponse : 1:04");
  assert.equal(chatReplyCountdownLabel({active:true,phase:"waiting",nextReplyAt:due},now+64000),
    "Délai écoulé · vérification de la réponse en cours");
  assert.match(chatReplyCountdownLabel({active:true,phase:"generating",nextReplyAt:due},now),/durée inconnue/);
  assert.match(chatReplyCountdownLabel({active:true,phase:"sending",nextReplyAt:due},now),/confirmation en attente/);
  assert.match(chatReplyCountdownLabel({active:true,phase:"waiting",nextReplyAt:null},now),/aucun envoi planifié/);
  assert.match(chatReplyCountdownLabel({active:false,phase:"waiting",nextReplyAt:due},now),/mode Chat inactif/);
  assert.match(chatReplyCountdownLabel({active:true,phase:"waiting",nextReplyAt:"not-a-date"},now),/indisponible/);
  assert.match(chatReplyCountdownLabel({active:true,phase:"waiting",nextReplyAt:new Date(now+7200000).toISOString()},now),/indisponible/);
  const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");
  const [html,launcher,content,runner,controller]=await Promise.all([
    "public/launcher.html","src/launcher.ts","src/content.ts",
    "src/tinder-global-existing-runner.ts","src/unified-controller-background.ts"
  ].map(read));
  assert.match(html,/id="chatCountdown"/);
  assert.match(html,/role="timer" aria-live="off"/);
  assert.match(launcher,/window\.setInterval\(renderChatCountdown, 1000\)/);
  assert.match(launcher,/nextReplyAt: info\?\.nextReplyAt/);
  assert.match(content,/const nextReplyAt = new Date\(Date\.now\(\) \+ Math\.ceil\(delaySeconds \* 1000\)\)/);
  assert.match(runner,/nextReplyAt: null, lastActionAt/);
  assert.match(runner,/message\.nextReplyAt/);
  assert.match(controller,/nextReplyAt: owner\.mode === "active-chat"/);
});

test("content scan does not starve or drop a busy in-flight reply observation",async()=>{
  const source=await readFile(new URL("../src/content.ts",import.meta.url),"utf8");
  assert.match(source,/Math\.min\(900, 3000 - \(now - scanScheduledAt\)\)/);
  assert.match(source,/rescanRequestedWhileBusy = true/);
  assert.match(source,/rescanRequestedWhileBusy && hasLiveExtensionContext\(\)/);
  assert.match(source,/scheduleScan\(\);/);
  assert.match(source,/busy = true; \/\/ One scanner owns preflight/);
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
test("fresh verified incoming takes precedence over an outgoing unread hint",()=>{
  let queue=reconcileExistingIndex(null,"one",[
    source("a","incoming"),source("b","outgoing")
  ],base);
  queue=observeUnreadThreads(queue,["b"],"2026-10-14T19:01:00Z");
  assert.equal(nextWatchedReply(queue),"a","a confirmed unanswered incoming message wins over stale outgoing hint");
  queue=markThreadChecked(queue,"a","2026-10-14T19:02:00Z");
  assert.equal(nextWatchedReply(queue),"b","still inspect unread outgoing when confirmed incoming was handled");
  queue=markThreadChecked(queue,"b","2026-10-14T19:02:00Z");
  queue=observeUnreadThreads(queue,["b"],"2026-10-14T19:02:30Z");
  assert.equal(nextWatchedReply(queue),null,"a lingering badge cannot requeue during cooldown");
});
test("priority is deterministic: fresh unanswered before stale badges, rechecks last",()=>{
  let work=reconcileExistingIndex(null,"owner",[
    source("outgoing","outgoing"),
    source("a-new","incoming"),
    source("z-new","incoming")
  ],"2026-10-14T19:00:00Z");
  work=observeUnreadThreads(work,["outgoing"],"2026-10-14T19:01:00Z");
  assert.equal(nextWatchedReply(work),"a-new","oldest queued fresh incoming comes first");
  work=observeUnreadThreads(work,["z-new"],"2026-10-14T19:01:10Z");
  assert.equal(nextWatchedReply(work),"z-new","unread + verified incoming has highest priority");
  work=markThreadChecked(work,"z-new","2026-10-14T19:01:20Z");
  assert.equal(nextWatchedReply(work),"a-new","remaining fresh incoming precedes stale badge");
  work=markThreadChecked(work,"a-new","2026-10-14T19:01:30Z");
  assert.equal(nextWatchedReply(work),"outgoing");
  assert.equal(watcherReplyPriority(work.threads.find(t=>t.ref==="outgoing")),2);
  assert.equal(watcherReplyPriority(work.threads.find(t=>t.ref==="z-new")),1);
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

test("opening a Tinder thread explicitly scans its EXISTING messages without waiting for a new incoming event", async () => {
  const [runner, content] = await Promise.all([
    "src/tinder-global-existing-runner.ts", "src/content.ts"
  ].map(path => readFile(new URL("../" + path, import.meta.url), "utf8")));
  const opened = runner.slice(runner.indexOf("const displayedLabel = name ?? label;"),
    runner.indexOf("  } catch (error) {", runner.indexOf("const displayedLabel = name ?? label;")));
  assert.match(opened, /await save\(activity\(/,
    "the watcher must persist the new lastRef first to accept content reports");
  assert.match(opened, /const probe = await requestOpenedChatScan\(tabId, nextRef\)/,
    "opening a chat must explicitly trigger inspection of old messages");
  assert.ok(opened.indexOf("const probe = await requestOpenedChatScan") >
    opened.indexOf("Opened ${displayedLabel}"),
    "content reports must not race ahead of the persisted lastRef");
  assert.match(runner, /TNND_EXISTING_SCAN_OPENED_THREAD/);
  assert.match(runner, /awaitingChatScanAttempts < 2/);
  assert.match(runner, /Aucun résultat du moteur Chat après deux scans explicites/);
  const handler = content.slice(content.indexOf('type?: unknown }).type !== "TNND_EXISTING_SCAN_OPENED_THREAD"') - 300,
    content.indexOf("// Executed only after the background worker claims"));
  assert.match(handler, /currentConversationRef\(\) !== ref/);
  assert.match(handler, /adapter\.inspectUnanswered\(\)/);
  assert.match(handler, /spaNavigationSettlesAt - Date\.now\(\)/);
  assert.match(handler, /void scan\(\)/);
  assert.match(content, /Unanswered incoming message found \(old or new\)/);
  assert.match(content, /backendAllowsAutomaticReply\(conversationRef\)/);
  assert.match(content, /freshState\.processed\[finalSnapshot\.latestIncomingKey\]/);
  // Negative Tinder status closes an already replied thread; a still-loading
  // transcript receives a distinct waiting reason, never an invented Send.
  assert.match(content, /"already-replied", "no-incoming", "unrecognized-direction"/);
  assert.match(content, /Tinder chat composer not ready/);
});

test("opening an old incoming chat does not acknowledge the reply before content confirms an outcome", async () => {
  const runner = await readFile(new URL("../src/tinder-global-existing-runner.ts", import.meta.url), "utf8");
  const opening = runner.slice(runner.indexOf('const result = await withSpaNavigationTimeout('),
    runner.indexOf('  } catch (error) {', runner.indexOf('const result = await withSpaNavigationTimeout(')));
  assert.match(opening, /awaitingChatRef: nextRef/);
  assert.match(opening, /awaitingChatSince: new Date\(\)\.toISOString\(\)/);
  assert.doesNotMatch(opening.slice(opening.indexOf("const checked = queued;")),
    /markThreadChecked\(queued, nextRef\)/,
    "a SUCCESSFUL navigation is not a reply; failed navigation may be deferred");
  const event = runner.slice(runner.indexOf("async function contentEvent("),
    runner.indexOf("chrome.alarms.onAlarm.addListener(", runner.indexOf("async function contentEvent(")));
  assert.match(event, /completedVisit = outcome && fresh\.awaitingChatRef === senderRef/);
  assert.match(event, /\["sent", "skipped", "error"\]\.includes\(phase\)/);
  assert.match(event, /await saveWorkIndex\(markThreadChecked\(index, senderRef\)\)/);
  assert.match(event, /awaitingChatRef: null, awaitingChatSince: null/);
  const tick = runner.slice(runner.indexOf("async function tick(): Promise<void> {"),
    runner.indexOf("const dwellSeconds = await getCadenceSeconds();", runner.indexOf("async function tick(): Promise<void> {")));
  assert.match(tick, /if \(replyInProgress \|\| age < 30_000\) return/);
  assert.match(tick, /enabled: false, pausedOnStop: true/,
    "ambiguous send after lease expiry must fail closed");
  const pending = reconcileExistingIndex(null, "user", [
    source("amiraOldMessage", "incoming"), source("oumaOldMessage", "incoming")
  ], base);
  assert.equal(pendingWatchedReplies(pending), 2);
  assert.equal(nextWatchedReply(pending), "amiraOldMessage");
  // Merely visiting Amira must not call markThreadChecked: Ouma cannot steal
  // the Tinder tab while Amira's scheduled AI reply is still being prepared.
  assert.equal(pendingWatchedReplies(pending), 2);
  assert.equal(nextWatchedReply(markThreadChecked(pending, "amiraOldMessage")), "oumaOldMessage",
    "only a terminal outcome can let the watcher move on");
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
  assert.equal(JSON.parse(manifest).version, JSON.parse(await read("package.json")).version,
    "Watcher must not hardcode an old extension release version");
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
  assert.equal(presentWatcherStatus({ ...stopped, pausedOnStop: true }, null, null).label,
    "Stopped · watcher is off", "manual Stop should not be misclassified as crash");
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
