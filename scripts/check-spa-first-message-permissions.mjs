import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { senderMatchesLiveTinderThread } from "../src/tinder-sender-route-guard.ts";
import { recoverVerifiedPreSendFailures } from "../src/tinder-first-message-recovery.ts";
import { armExistingMatches, finishNewMatchAttempt } from "../src/tinder-new-match-observation.ts";

const root="https://tinder.com";
test("Tinder SPA: content sender document URL stays old; CURRENT tab route authorizes intended match",()=>{
  assert.equal(senderMatchesLiveTinderThread(root+"/app/messages/old",root+"/app/messages/srim","srim",0),true);
  assert.equal(senderMatchesLiveTinderThread(root+"/app/recs",root+"/app/messages/srim","srim",0),true);
  assert.equal(senderMatchesLiveTinderThread(root+"/app/messages/old",root+"/app/messages/srim","old",0),false);
});
test("fail closed on wrong tab origin, unknown route, wrong frame, or spoofed ref",()=>{
  const original=root+"/app/messages/previous";
  for(const [url,ref,frame] of [
    ["https://evil.test/app/messages/srim","srim",0],
    [root+"/app/messages/other","srim",0],
    [root+"/app/recs","srim",0],
    [root+"/app/messages/srim","srim",2],
    [root+"/app/messages/srim","srim/another",0],
    [root+"/app/messages/srim?next=old","old",0],
    ["https://www.tinder.com/app/messages/srim","srim",0]
  ]) assert.equal(senderMatchesLiveTinderThread(original,url,ref,frame),false);
  assert.equal(senderMatchesLiveTinderThread("https://evil.test/app/messages/old",root+"/app/messages/srim","srim",0),false);
});
test("requeue only failed refs that have never reached ANY durable send journal",()=>{
  let prior=armExistingMatches(["a","b","c","d"],"account");
  prior=finishNewMatchAttempt(prior,"a",false,"SPA permission denied");
  prior=finishNewMatchAttempt(prior,"b",false,"Delivery uncertain");
  prior=finishNewMatchAttempt(prior,"c",true,"Sent");
  const result=recoverVerifiedPreSendFailures(prior,new Set(["b"]),new Set(["first-message:c"]));
  assert.deepEqual(result.recovered,["a"]);
  const restarted=armExistingMatches(["d","c","b","a"],"account",result.prior);
  assert.deepEqual(restarted.pendingRefs,["d","a"]);
  assert.ok(!restarted.pendingRefs.includes("b"));
  assert.ok(!restarted.pendingRefs.includes("c"));
});
test("never recover failed opener with either sender journal",()=>{
  let state=armExistingMatches(["a","b"],"u");
  state=finishNewMatchAttempt(state,"a",false,"unknown");
  state=finishNewMatchAttempt(state,"b",false,"unknown");
  const result=recoverVerifiedPreSendFailures(state,new Set(["a"]),new Set(["first-message:b"]));
  assert.deepEqual(result.recovered,[]);
});
test("background permission gates trust LIVE tab location rather than MessageSender URL",async()=>{
  const source=await readFile(new URL("../src/background.ts",import.meta.url),"utf8");
  const guard=await readFile(new URL("../src/tinder-sender-route-guard.ts",import.meta.url),"utf8");
  const queue=await readFile(new URL("../src/tinder-new-match-background.ts",import.meta.url),"utf8");
  assert.match(source,/TNND_GET_NEW_MATCH_SEND_PERMISSION/);
  assert.match(source,/TNND_GET_FIRST_MESSAGE_PERMISSION/);
  assert.match(source,/TNND_CLAIM_FIRST_MESSAGE/);
  assert.match(source,/TNND_GET_BACKEND_AUTO_SEND_PERMISSION/);
  assert.match(source,/currentAuthorizedTinderThread\(sender, ref\)/);
  assert.doesNotMatch(source,/senderThreadRef\(sender\)/);
  assert.match(guard,/await chrome\.tabs\.get\(sender\.tab\.id\)/);
  assert.match(guard,/sender\.id !== chrome\.runtime\.id/);
  assert.match(queue,/recoverVerifiedPreSendFailures\(prior, durable, processed\)/);
  assert.match(queue,/prior\.userId === session\.user\.id/);
});
