import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import { reconcileExistingIndex, markThreadChecked, observeUnreadThreads, nextIndexedExistingThread } from "../src/tinder-existing-thread-index.ts";
const at=(s)=>({ref:s,lastMessageAt:"2026-10-13T18:00:00Z"});
test("queue keys by stable Tinder ref, not the current sidebar order",()=>{
 let q=reconcileExistingIndex(null,"user-a",[at("srim"),at("youssra"),at("nawal")],"2026-10-13T20:00:00Z");
 assert.deepEqual(q.threads.map(x=>x.ref),["srim","youssra","nawal"]);
 q=markThreadChecked(q,"srim","2026-10-13T20:01:00Z");
 q=reconcileExistingIndex(q,"user-a",[at("nawal"),at("youssra"),at("srim")],"2026-10-13T20:02:00Z");
 assert.equal(q.threads.find(x=>x.ref==="srim").queuedAt,null);
 assert.notEqual(nextIndexedExistingThread(q),"srim");
});
test("changed database latest message time requeues only touched conversation",()=>{
 let q=reconcileExistingIndex(null,"u",[at("srim"),at("nawal")],"2026-10-13T20:00:00Z");
 q=markThreadChecked(markThreadChecked(q,"srim"),"nawal");
 q=reconcileExistingIndex(q,"u",[at("nawal"),{ref:"srim",lastMessageAt:"2026-10-13T20:03:00Z"}],"2026-10-13T20:04:00Z");
 assert.equal(nextIndexedExistingThread(q),"srim");
});
test("unread hint priority, no immediate duplicate requeue, account isolation",()=>{
 let q=reconcileExistingIndex(null,"u",[at("srim"),at("nawal")],"2026-10-13T20:00:00Z");
 q=markThreadChecked(markThreadChecked(q,"srim","2026-10-13T20:01:00Z"),"nawal","2026-10-13T20:01:00Z");
 q=observeUnreadThreads(q,["srim"],"2026-10-13T20:01:05Z");
 assert.equal(nextIndexedExistingThread(q),null);
 q=observeUnreadThreads(q,["srim"],"2026-10-13T20:03:05Z");
 assert.equal(nextIndexedExistingThread(q),"srim");
 q=reconcileExistingIndex(q,"other",[at("nawal")]);
 assert.equal(q.threads.length,1);
 assert.notEqual(q.userId,"u");
});
test("extension only runs indexed server-authorized refs and never stores message text",async()=>{
 const runner=await readFile(new URL("../src/tinder-global-existing-runner.ts",import.meta.url),"utf8");
 const content=await readFile(new URL("../src/content.ts",import.meta.url),"utf8");
 assert.match(runner,/eligibleExistingThreadRefs\(records, summaries\)/);
 assert.match(runner,/reconcileExistingIndex\(await readWorkIndex\(session\.user\.id\)/);
 assert.match(runner,/state\.mode === "watcher" \? nextWatchedReply\(queued\) : nextIndexedExistingThread\(queued\)/);
 assert.match(runner,/markThreadChecked\(work, nextRef\)/);
 assert.match(content,/discoverUnreadThreadCandidates\(\)/);
 assert.match(content,/TNND_EXISTING_RUNNER_UNREAD/);
 assert.match(runner,/sender\.tab\?\.id !== state\.tabId/);
});

test("synced outgoing chats are not opened on the first pass; incoming and unread first",()=>{
  const at0 = "2026-10-13T20:00:00Z";
  const records = [
    {ref:"answered",lastMessageAt:at0,lastMessageDirection:"outgoing"},
    {ref:"needs-reply",lastMessageAt:at0,lastMessageDirection:"incoming"},
    {ref:"unknown",lastMessageAt:at0},
    {ref:"answered2",lastMessageAt:at0,lastMessageDirection:"outgoing"}
  ];
  let q=reconcileExistingIndex(null,"user-1",records,"2026-10-13T20:01:00Z");
  assert.equal(q.threads.find(t=>t.ref==="answered")?.queuedAt,null);
  assert.equal(nextIndexedExistingThread(q),"needs-reply");
  // A real unread Tinder hint overrides stale synchronized outgoing status.
  q=observeUnreadThreads(q,["answered"],"2026-10-13T20:02:00Z");
  assert.equal(nextIndexedExistingThread(q),"answered");
  q=markThreadChecked(q,"answered","2026-10-13T20:03:00Z");
  q=reconcileExistingIndex(q,"user-1",records,"2026-10-13T20:04:00Z");
  assert.equal(q.threads.find(t=>t.ref==="answered")?.queuedAt,null);
  // Eventually recheck, because synced backend may miss offscreen Tinder changes.
  q=reconcileExistingIndex(q,"user-1",records,"2026-10-14T03:04:00Z");
  assert.equal(nextIndexedExistingThread(q),"needs-reply");
  assert.notEqual(q.threads.find(t=>t.ref==="answered")?.queuedAt,null);
});
