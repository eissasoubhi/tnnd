import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { naturalReplyBubbles } from "../src/tinder-reply-bubbles.ts";

const long="Ça va bien, je suis tranquille ce soir. Et toi tu préfères sortir vers la mer ou rester avec tes amis pendant le weekend ?";
test("short and disabled replies remain single bubble",()=>{
 assert.deepEqual(naturalReplyBubbles("salut cv",{enabled:true}),["salut cv"]);
 assert.deepEqual(naturalReplyBubbles(long,{enabled:false}),[long]);
 assert.deepEqual(naturalReplyBubbles("x".repeat(160),{enabled:true}),["x".repeat(160)]);
});
test("when enabled, long natural replies can become two complete bubbles",()=>{
 const candidates=[
  long,
  "Oui carrément, ça me fait plaisir de discuter avec toi. Moi je suis plutôt du genre à profiter du weekend en terrasse, et toi tu préfères quoi ?",
  "Ça va bien, merci pour ton message. Tu me demandais pour mes origines, je suis de Casablanca à la base, mais je vis en région parisienne.",
  "J'aime bien faire des petites balades le samedi, surtout quand il fait beau. Ensuite j'aime aussi prendre un café tranquillement avec des amis."
 ];
 const outputs=candidates.map(x=>naturalReplyBubbles(x,{enabled:true,minCharacters:90}));
 assert.ok(outputs.some(parts=>parts.length===2));
 for(let i=0;i<candidates.length;i++) {
  const parts=outputs[i];
  assert.ok(parts.length===1||parts.length===2);
  assert.equal(parts.join(" "),candidates[i]);
  assert.ok(parts.every(p=>p.length>0));
 }
});
test("multipart send retains one durable claim and checks newer messages between bubbles",async()=>{
 const c=await readFile(new URL("../src/content.ts",import.meta.url),"utf8");
 assert.match(c,/freshState\.processed\[finalSnapshot\.latestIncomingKey\] = Date\.now\(\)/);
 assert.match(c,/naturalReplyBubbles\(reply/);
 assert.match(c,/fresh\.latestIncomingKey !== currentSnapshot\.latestIncomingKey/);
 assert.match(c,/sameOpenerThreadUninterrupted\(adapter\.readVisibleMessages\(\), bubbles\[index-1\]\)/);
 assert.match(c,/backendAllowsAutomaticReply\(conversationRef\)/);
 assert.match(c,/openerDelaySeconds/);
 assert.match(c,/await adapter\.send\(part\)/);
});
