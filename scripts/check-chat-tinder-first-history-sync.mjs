import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { senderMatchesLiveTinderThread } from "../src/tinder-sender-route-guard.ts";
import { prepareReadOnlyImportBatches } from "../src/tinder-manual-import.ts";
import { shouldImportThread, DEFAULT_TINDER_IMPORT_SETTINGS } from "../src/tinder-import-settings.ts";
const read = file => readFile(new URL("../"+file,import.meta.url),"utf8");

test("same Tinder origin and live SPA route permits read-only import despite stale MessageSender.url",()=>{
  assert.equal(senderMatchesLiveTinderThread(
    "https://tinder.com/app/messages/previous",
    "https://tinder.com/app/messages/current","current",0),true);
  assert.equal(senderMatchesLiveTinderThread(
    "https://tinder.com/app/recs",
    "https://tinder.com/app/messages/current","current",0),true);
  for(const [sender,tab,ref,frame] of [
    ["https://evil.example/app/recs","https://tinder.com/app/messages/current","current",0],
    ["https://tinder.com/app/recs","https://tinder.com/app/messages/other","current",0],
    ["https://tinder.com/app/recs","https://tinder.com/app/messages/current","current",2],
    ["https://tinder.com/app/recs","https://www.tinder.com/app/messages/current","current",0]
  ]) assert.equal(senderMatchesLiveTinderThread(sender,tab,ref,frame),false);
});

test("read-only historical import never enables AI management, preserves existing status",()=>{
  const msgs=[{key:"old-out",direction:"me",text:"Salut"},
              {key:"old-in",direction:"them",text:"Coucou"}];
  const fresh=prepareReadOnlyImportBatches(msgs,false,"2026-11-11T10:00:00.000Z");
  const existing=prepareReadOnlyImportBatches(msgs,true,"2026-11-11T10:00:00.000Z");
  assert.equal(fresh[0].requestedStatus,"paused");
  assert.equal(existing[0].requestedStatus,null);
  assert.deepEqual(fresh[0].messages.map(x=>x.direction),["outgoing","incoming"]);
  assert.ok(Date.parse(fresh[0].messages[0].sentAt) < Date.parse(fresh[0].messages[1].sentAt));
  assert.equal(shouldImportThread(DEFAULT_TINDER_IMPORT_SETTINGS,{messageCount:2}).eligible,true);
});

test("Chat scanner MUST await verified Tinder history sync BEFORE backend consent and semantic AI", async()=>{
  const [content,worker,bridge] = await Promise.all([
    "src/content.ts","src/tinder-read-only-bulk-sync-background.ts",
    "src/tinder-sender-route-guard.ts"
  ].map(read));
  const start=content.indexOf("TINDER FIRST: the open chat");
  assert.ok(start>0);
  const scanner=content.slice(start, content.indexOf("const hold = automaticReplyHold(",start));
  assert.match(scanner,/type: "TNND_IMPORT_OPENED_THREAD_OBSERVED"/);
  assert.match(scanner,/messagesOnly: true/);
  assert.ok(scanner.indexOf("await sendRuntimeMessage")<scanner.indexOf("await backendAutomaticReplyPermission"));
  assert.ok(scanner.indexOf("await backendAutomaticReplyPermission")<scanner.indexOf("await syncObservedConversationBoundary"));
  assert.match(scanner,/adapter\.read\(\)\?\.latestIncomingKey !== snapshot\.latestIncomingKey/);
  assert.match(scanner,/reportExistingRunner\("skipped",reason\)/);
  assert.match(worker,/senderMatchesLiveTinderThread\(sender\.url, tab\.url, ref, sender\.frameId\)/);
  assert.doesNotMatch(worker,/pathRef\(sender\.url\) !== ref/);
  assert.match(worker,/const autoOpenedInFlight = new Map/);
  assert.match(worker,/if \(running\) return running/);
  assert.match(worker,/!prefs\.autoSyncOpened/);
  assert.match(worker,/!prefs\.includeMessages/);
  assert.match(worker,/upload\(ref,observed,session\.user\.id,syncPrefs/);
  assert.match(worker,/readOnlyImport:true/);
  assert.match(bridge,/sender\.origin !== live\.origin/);
});

test("missing conversations are only imported, never silently opted into AI automation",async()=>{
  const [worker,background]=await Promise.all([
    "src/tinder-read-only-bulk-sync-background.ts","src/background.ts"
  ].map(read));
  assert.match(worker,/\? \{status:"paused"\}/);
  assert.match(worker,/existing\?null:"paused"/);
  assert.doesNotMatch(worker,/managementState:\s*"ai-managed"/);
  assert.match(background,/if \(backend\.management\.state !== "ai-managed"\)/);
  assert.match(background,/if \(!backend\.management\.explicitlySelected\)/);
});
