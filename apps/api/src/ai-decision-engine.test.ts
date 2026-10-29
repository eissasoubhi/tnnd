import assert from "node:assert/strict";
import test from "node:test";
import { AiDecisionProviderError, requestAiDecision } from "./ai-decision-engine.js";
const credentials = { apiKey:"test-secret", model:"gemini-test" };
const task = {
  task:"conversation-strategy",
  instructions:["Decide how to continue the exchange; never assume permission to send."],
  evidence:{messages:[{direction:"incoming",text:"Hhh chno 3andk?"}]},
  responseSchema:{
    type:"OBJECT",properties:{intent:{type:"STRING",enum:["answer","clarify","uncertain"]}},
    required:["intent"]
  },
  validate(value:unknown) {
    const result=value as {intent?:unknown} | null;
    return result && ["answer","clarify"].includes(String(result.intent))
      ? { intent:result.intent as string } : null;
  }
};
function fake(payload:unknown,status=200) {
  let requests=0;
  const fetcher:typeof fetch=async (_url,init)=>{
    requests++;
    const headers=new Headers(init?.headers);
    assert.equal(headers.get("x-goog-api-key"),credentials.apiKey);
    assert.equal(headers.get("content-type"),"application/json");
    const body=JSON.parse(String(init?.body));
    assert.equal(body.generationConfig.responseMimeType,"application/json");
    assert.equal(body.generationConfig.temperature,0);
    assert.deepEqual(body.generationConfig.responseSchema,task.responseSchema);
    const prompt=body.contents[0].parts[0].text as string;
    assert.match(prompt,/untrusted DATA/);
    assert.match(prompt,/EVIDENCE_JSON:/);
    assert.match(prompt,/Hhh chno 3andk/);
    assert.match(prompt,/conversation-strategy/);
    assert.equal(prompt.includes(credentials.apiKey),false);
    return new Response(JSON.stringify(payload),{status});
  };
  return {fetcher,get requests(){return requests;}};
}
test("AI-first core returns only strictly validated structured decisions",async()=>{
  const provider=fake({candidates:[{content:{parts:[{text:'{"intent":"answer"}'}]}}]});
  assert.deepEqual(await requestAiDecision(task,credentials,provider.fetcher),{intent:"answer"});
  assert.equal(provider.requests,1);
});
test("invalid model output is uncertain, never an implicit approval",async()=>{
  for(const content of ['{"intent":"send-now"}','not JSON','{"intent":"uncertain"}']){
    const provider=fake({candidates:[{content:{parts:[{text:content}]}}]});
    assert.equal(await requestAiDecision(task,credentials,provider.fetcher),null);
  }
  const truncated=fake({candidates:[{finishReason:"MAX_TOKENS",content:{parts:[{text:'{"intent":"answer"}'}]}}]});
  assert.equal(await requestAiDecision(task,credentials,truncated.fetcher),null);
  const blocked=fake({candidates:[{finishReason:"SAFETY"}]});
  assert.equal(await requestAiDecision(task,credentials,blocked.fetcher),null);
});
test("provider failures do not return a decision or reveal private exception data",async()=>{
  const broken=fake({error:"secret"},503);
  await assert.rejects(requestAiDecision(task,credentials,broken.fetcher),AiDecisionProviderError);
  await assert.rejects(requestAiDecision(task,credentials,async()=>{throw new Error("personal message text");}),err=>{
    assert.equal((err as Error).message,"ai_decision_provider_unavailable");return true;
  });
});
test("task and context size are validated before any provider call",async()=>{
  let called=false;
  const fetcher:typeof fetch=async()=>{called=true;throw new Error("should not run");};
  await assert.rejects(requestAiDecision({...task,task:"../foo"},credentials,fetcher),/invalid_ai_decision_task/);
  await assert.rejects(requestAiDecision({...task,evidence:{text:"x".repeat(36_000)}},credentials,fetcher),/invalid_ai_decision_evidence/);
  assert.equal(called,false);
});
