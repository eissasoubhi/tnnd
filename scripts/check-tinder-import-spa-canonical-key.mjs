import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { tinderThreadKeyFromPath } from "../src/tinder-thread-identity.ts";
import { senderMatchesLiveTinderThread } from "../src/tinder-sender-route-guard.ts";
import { prepareReadOnlyImportBatches } from "../src/tinder-manual-import.ts";
const read = path => readFile(new URL("../"+path,import.meta.url),"utf8");

test("canonical Tinder chat identity is /app/messages/ref, not the raw ref",async()=>{
  const ref="6a63b9c6",route=tinderThreadKeyFromPath("/app/messages/"+ref);
  assert.equal(route,"/app/messages/6a63b9c6");
  assert.notEqual(route,ref);
  const worker=await read("src/tinder-read-only-bulk-sync-background.ts");
  assert.match(worker,/function expectedThreadKey\(ref: string\)/);
  assert.match(worker,/snapshot\.threadKey===expectedThreadKey\(ref\)/);
  assert.match(worker,/snapshot\.threadKey === expectedThreadKey\(ref\)/);
  assert.match(worker,/info\.threadKey === expectedThreadKey\(ref\)/);
  assert.doesNotMatch(worker,/snapshot\.threadKey\s*===\s*ref/);
  assert.doesNotMatch(worker,/snapshot\.threadKey\s*!==\s*ref/);
});

test("importer accepts a SPA route switch only from the genuine live Tinder main frame",async()=>{
  const root="https://tinder.com";
  assert.equal(senderMatchesLiveTinderThread(root+"/app/recs",
    root+"/app/messages/6a63b9c6","6a63b9c6",0),true);
  assert.equal(senderMatchesLiveTinderThread(root+"/app/messages/old",
    root+"/app/messages/6a63b9c6","6a63b9c6",0),true);
  for (const [sender,tab,ref,frame] of [
    ["https://evil.example/app/recs",root+"/app/messages/6a63b9c6","6a63b9c6",0],
    [root+"/app/recs",root+"/app/messages/other","6a63b9c6",0],
    [root+"/app/recs",root+"/app/messages/6a63b9c6","6a63b9c6",1],
    [root+"/app/recs","https://www.tinder.com/app/messages/6a63b9c6","6a63b9c6",0]
  ]) assert.equal(senderMatchesLiveTinderThread(sender,tab,ref,frame),false);
  const worker=await read("src/tinder-read-only-bulk-sync-background.ts");
  assert.match(worker,/senderMatchesLiveTinderThread\(sender\.url, tab\.url, ref, sender\.frameId\)/);
  assert.doesNotMatch(worker,/pathRef\(sender\.url\) !== ref/);
  assert.match(worker,/pathRef\(current\.url\) !== ref/);
});

test("overlapping passive/Chat imports await one in-flight read-only upload",async()=>{
  const worker=await read("src/tinder-read-only-bulk-sync-background.ts");
  assert.match(worker,/const autoOpenedInFlight = new Map/);
  assert.match(worker,/if \(running\) return running/);
  assert.match(worker,/autoOpenedInFlight\.set\(key,work\)/);
  assert.match(worker,/autoOpenedInFlight\.delete\(key\)/);
  assert.match(worker,/!prefs\.autoSyncOpened/);
  assert.match(worker,/!prefs\.includeMessages/);
  assert.match(worker,/readOnlyImport:true/);
  assert.match(worker,/upload\(ref,observed,session\.user\.id,syncPrefs/);
});

test("read-only import preserves existing statuses and never opts in AI",async()=>{
  const msgs=[{key:"m1",direction:"me",text:"Salut"},
              {key:"m2",direction:"them",text:"Coucou"}];
  const first=prepareReadOnlyImportBatches(msgs,false,"2026-11-11T00:00:00.000Z");
  const again=prepareReadOnlyImportBatches(msgs,true,"2026-11-11T00:00:00.000Z");
  assert.equal(first[0].requestedStatus,"paused");
  assert.equal(again[0].requestedStatus,null);
  assert.deepEqual(first[0].messages.map(x=>x.direction),["outgoing","incoming"]);
  const worker=await read("src/tinder-read-only-bulk-sync-background.ts");
  assert.match(worker,/existing\?null:"paused"/);
  assert.doesNotMatch(worker,/managementState:\s*"ai-managed"/);
});
