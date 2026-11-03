import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  prepareFullConversationHistory,
  type FullHistoryMessage,
  type HistoryReviewer
} from "./conversation-full-history.js";

const message = (index: number, text?: string): FullHistoryMessage => ({
  direction: index % 2 ? "incoming" : "outgoing",
  text: text ?? `Old message ${index}`,
  sentAt: new Date(Date.UTC(2026,0,1,0,index)).toISOString(),
  timestampVerified: index % 3 === 0
});
const config = {apiKey:"test-key-not-sent-to-user",model:"gemini-test"};

test("reads every message, in order, including old answered questions",async()=>{
  const messages=[message(0,"Tu aimes le cinéma ?"),message(1,"Oui, les films de SF."),
    message(2,"Et ta ville ?"),message(3,"Je suis à Paris."),message(4,"On va voir un film ?")];
  const reviewed=await prepareFullConversationHistory(messages,"On va voir un film ?");
  assert.equal(reviewed.mode,"verbatim");
  assert.equal(reviewed.messageCount,5);
  const parsed=JSON.parse(reviewed.context.split("FULL_CONVERSATION_JSON: ")[1]!);
  assert.deepEqual(parsed.map((x:{number:number})=>x.number),[1,2,3,4,5]);
  assert.equal(parsed[0].text,"Tu aimes le cinéma ?");
  assert.equal(parsed[1].text,"Oui, les films de SF.");
  assert.equal(parsed.at(-1).text,"On va voir un film ?");
  assert.equal(parsed[0].verifiedSentAt,undefined);
  assert.ok(parsed[3].verifiedSentAt);
  assert.match(reviewed.context,/already answered/i);
});

test("large conversations re-read ALL chunks by AI, never only last N messages",async()=>{
  const messages=Array.from({length:650},(_,i)=>message(i,
    i===7?"J'ai déjà dit que j'habite Paris":i===500?"Le sujet cinéma revient":"Une conversation historique très détaillée #"+i+" ".repeat(18)));
  const visited=new Set<number>();
  let calls=0;
  const review:HistoryReviewer=async(evidence,credentials)=>{
    assert.equal(credentials.model,config.model);
    const chunk=evidence as {segment:number;of:number;chronologicalMessages:Array<{number:number;text:string}>};
    calls++;
    assert.ok(chunk.of>1);
    for(const row of chunk.chronologicalMessages) visited.add(row.number);
    return {recap:"Segment "+chunk.segment+" / "+chunk.of,alreadyAnswered:[],pendingQuestions:[],
      relevantOldTopics:[]};
  };
  const result=await prepareFullConversationHistory(messages,"Cinéma ?",config,review);
  assert.equal(result.mode,"ai-reviewed");
  assert.equal(result.messageCount,messages.length);
  assert.equal(result.segmentCount,calls);
  assert.ok(calls>1);
  assert.equal(visited.size,messages.length);
  for(let i=1;i<=messages.length;i++)assert.ok(visited.has(i),"missing historical message "+i);
  assert.match(result.context,/COMPLETE HISTORY REVIEW/);
  assert.match(result.context,/ALL historical/i);
});

test("long history cannot degrade silently if the provider is missing or uncertain",async()=>{
  const messages=Array.from({length:500},(_,i)=>message(i,"Long conversation "+
    "detail".repeat(65)+i));
  await assert.rejects(prepareFullConversationHistory(messages,"latest"),/conversation_history_review_unavailable/);
  await assert.rejects(prepareFullConversationHistory(messages,"latest",config,async()=>null),
    /conversation_history_review_unavailable/);
});

test("oversized individual message fails instead of truncating history",async()=>{
  const messages=[message(0,"a".repeat(111_000))];
  await assert.rejects(prepareFullConversationHistory(messages,"latest",config,async()=>null),
    /conversation_history_message_too_large/);
});

test("Web drafts and extension generations both include complete history, not only recent slice",async()=>{
  const [web,extension,provider]=await Promise.all([
    "conversation-generation-service.ts","extension-suggestions.ts","gemini-provider.ts"
  ].map(name=>readFile(new URL("./"+name,import.meta.url),"utf8")));
  assert.match(web,/prepareFullConversationHistory\(conversation\.messages/);
  assert.match(web,/fullConversationContext: fullHistory\.context/);
  assert.match(provider,/input\.fullConversationContext/);
  assert.match(extension,/prepareFullConversationHistory\(storedConversation\.messages/);
  assert.match(extension,/conversation_history_not_synchronized/);
  assert.doesNotMatch(extension,/request\.context\.slice\(-9000\)/);
});
