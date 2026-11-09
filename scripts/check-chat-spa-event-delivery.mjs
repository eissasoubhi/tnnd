import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL("../"+path, import.meta.url), "utf8");
test("SPA events rely on live tab thread, never stale MessageSender.url thread",async()=>{
 const [runner,content]=await Promise.all(["src/tinder-global-existing-runner.ts","src/content.ts"].map(read));
 const event=runner.slice(runner.indexOf("async function contentEvent("),runner.indexOf("chrome.alarms.onAlarm.addListener("));
 assert.match(event,/!isTinderUrl\(sender\.url\)/, "sender document must still be Tinder origin");
 assert.match(event,/const senderRef = typeof message\.ref === "string"/);
 assert.doesNotMatch(event,/const senderRef = tinderRefFromUrl\(sender\.url\)/);
 assert.match(event,/chrome\.tabs\.get\(sender\.tab\.id\)/);
 assert.match(event,/tinderRefFromUrl\(liveTab\.url\) !== senderRef/);
 assert.match(event,/tinderRefFromUrl\(confirmedTab\.url\) !== senderRef/);
 assert.match(event,/fresh\.lastRef !== senderRef/);
 assert.match(event,/\["checking", "incoming", "waiting", "generating"/,
    "new diagnostic phase must be admitted by the watcher");
 assert.match(content,/reportExistingRunner\("checking", "Moteur Chat : scan effectivement démarré/);
 assert.match(content,/Moteur Chat : ancien message reconnu ET contexte extrait/);
 assert.match(content,/reportExistingRunner\("error", "Moteur Chat : impossible de récupérer/);
 assert.match(content,/backendAllowsAutomaticReply\(conversationRef\)/,
   "existing backend consent still gates any reply");
 assert.match(content,/freshState\.processed\[finalSnapshot\.latestIncomingKey\]/,
   "same incoming message cannot be sent twice");
});
