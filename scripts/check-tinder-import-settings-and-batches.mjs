import assert from "node:assert/strict";
import test from "node:test";
import { prepareReadOnlyImportBatches } from "../src/tinder-manual-import.ts";
import { readFileSync } from "node:fs";
test("every rendered message is retained across 40-message API batches in observed order",()=>{
  const messages=Array.from({length:93},(_,i)=>({key:"item-"+i,text:"hello-"+i,direction:i%2?"me":"them"}));
  const batches=prepareReadOnlyImportBatches(messages,false,"2026-10-17T17:00:00.000Z");
  assert.deepEqual(batches.map(x=>x.messages.length),[40,40,13]);
  assert.deepEqual(batches.flatMap(x=>x.messages.map(m=>m.text)),messages.map(x=>x.text));
  assert.equal(batches[0].requestedStatus,"paused");
  assert.equal(batches[1].requestedStatus,null);
  assert.equal(batches[1].messages[0].sentAt,"2026-10-17T17:00:00.040Z");
});
test("do not silently truncate beyond bounded DOM safety cap",()=>{
  const msg=Array.from({length:1001},(_,i)=>({key:"m-"+i,text:"test",direction:"them"}));
  assert.throws(()=>prepareReadOnlyImportBatches(msg,false,"2026-10-17T17:00:00Z"),/too_many_visible_messages/);
});
test("automated import only from current tab and Web-approved settings, never Tinder send",()=>{
  const worker=readFileSync(new URL("../src/tinder-read-only-bulk-sync-background.ts",import.meta.url),"utf8");
  const content=readFileSync(new URL("../src/content.ts",import.meta.url),"utf8");
  assert.match(worker,/readOnlyImport:true/);
  assert.match(worker,/prefs\.autoSyncOpened/);
  assert.match(worker,/prefs\.autoCollectLoaded/);
  assert.match(worker,/shouldImportThread/);
  assert.match(worker,/uploadVisibleMatchProfileCapture/);
  assert.match(content,/TNND_IMPORT_OPENED_THREAD_OBSERVED/);
  assert.doesNotMatch(worker,/TNND_START_FIRST_MESSAGE|TNND_AUTO_START_NEW_MATCH/);
});
