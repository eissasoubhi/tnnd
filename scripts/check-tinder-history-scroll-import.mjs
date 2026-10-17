import assert from "node:assert/strict";
import test from "node:test";
import { mergeOlderHistory, olderBackfillKey } from "../src/tinder-history-page-merge.ts";
import { readFileSync } from "node:fs";
const item=(n)=>({key:"id-"+n,direction:"them",text:"bubble-"+n});
test("older virtualized messages merge only through verified overlap, in order",()=>{
  const tail=[item(5),item(6),item(7)];
  const page=[item(3),item(4),item(5),item(6)];
  const merged=mergeOlderHistory(tail,page);
  assert.deepEqual(merged?.messages.map(x=>x.text),["bubble-3","bubble-4","bubble-5","bubble-6","bubble-7"]);
  assert.equal(merged?.added,2);
  assert.deepEqual(mergeOlderHistory(merged!.messages,merged!.messages)?.messages,merged?.messages);
});
test("missing overlap is untrusted, not a reason to guess message order",()=>{
  assert.equal(mergeOlderHistory([item(1),item(2)],[item(3),item(4)]),null);
});
test("older messages carry distinct deterministic local keys without fake Tinder timestamp",()=>{
  const a=olderBackfillKey("example-thread",-2,item(1));
  assert.match(a,/^history:/);
  assert.equal(a,olderBackfillKey("example-thread",-2,item(1)));
  assert.notEqual(a,olderBackfillKey("example-thread",-1,item(1)));
});
test("import scrolls only verified transcript and never calls a Tinder private API or Send",()=>{
  const content=readFileSync(new URL("../src/content.ts",import.meta.url),"utf8");
  const worker=readFileSync(new URL("../src/tinder-read-only-bulk-sync-background.ts",import.meta.url),"utf8");
  const adapter=readFileSync(new URL("../src/tinder-adapter.ts",import.meta.url),"utf8");
  assert.match(content,/TNND_IMPORT_SCROLL_OLDER_PAGE/);
  assert.match(content,/verifiedChatHistoryScroller/);
  assert.match(content,/ol\[aria-label="Messages"/);
  assert.match(content,/unsent_message_draft_present/);
  assert.match(worker,/readBackToFirstRenderedPage/);
  assert.match(worker,/mergeOlderHistory/);
  assert.match(worker,/TNND_IMPORT_RESTORE_LATEST/);
  assert.match(adapter,/readVisibleMessages\(maxItems = 40\)/);
  assert.doesNotMatch(worker,/api\.gotinder|graph\.tinder|TNND_START_FIRST_MESSAGE/);
});
