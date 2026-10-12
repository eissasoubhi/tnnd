import test from "node:test";
import assert from "node:assert/strict";
import { resolveAdaptiveStyle } from "./conversation-style-adaptation.js";

const defaults = { messageLength: "short", directness: "balanced", teasingStyle: "light", humorStyle: "playful", doubleTexting: "sometimes" };
test("a new conversation starts from the user's personality, not arbitrary neutral values", () => {
  const source = { humorLevel: 25, messageLength: "medium" as const };
  const result = resolveAdaptiveStyle(source, { ...defaults, autoAdapt: { messageLength: true, directness: true, teasingStyle: true, humorStyle: true, doubleTexting: true, languages: true } }, [], "");
  assert.equal(result.settings.messageLength, "short");
  assert.equal(result.settings.directness, 50);
  assert.equal(result.settings.teasingStyle, "light");
  assert.equal(result.settings.humorLevel, 60);
  assert.equal(result.settings.doubleTexting, "sometimes");
  assert.equal(result.settings.languages?.fr, 45);
  assert.equal(result.autoFields.length, 6);
  assert.deepEqual(source, { humorLevel: 25, messageLength: "medium" });
});
test("the baseline survives serious mood and returns when mood becomes playful", () => {
  const serious = resolveAdaptiveStyle({}, { ...defaults, autoAdapt: { humorStyle: true, teasingStyle: true } },
    [{direction:"incoming",text:"I'm sorry for your loss"}, {direction:"incoming",text:"I feel very sad, it's been difficult"}], "I feel very sad, it's been difficult");
  assert.equal(serious.settings.teasingStyle, "none");
  assert.ok((serious.settings.humorLevel ?? 100) <= 20);
  const fun = resolveAdaptiveStyle({}, defaults,
    [{ direction:"incoming", text:"haha 😂 so funny" }, {direction:"incoming",text:"lol 😂 good one"}], "lol 😂 good one");
  assert.equal(fun.settings.teasingStyle, "playful");
  assert.ok((fun.settings.humorLevel ?? 0) >= 60);
  const next = resolveAdaptiveStyle({}, { ...defaults, autoAdapt: { teasingStyle: true, humorStyle: true } }, [], "hi");
  assert.equal(next.settings.teasingStyle, "light");
  assert.equal(next.settings.humorLevel, 60);
});
test("disabling one adaptive field keeps its baseline while other fields adapt", () => {
  const profile = { ...defaults, humorStyle:"witty", autoAdapt:{ humorStyle:false, teasingStyle:true, messageLength:false, languages:false } };
  const fun = [{direction:"incoming" as const,text:"haha 😂 you are so funny"},{direction:"incoming" as const,text:"lol 😂 amazing"}];
  const result = resolveAdaptiveStyle({},profile,fun,"lol 😂 amazing");
  assert.equal(result.settings.humorLevel,65);
  assert.equal(result.settings.messageLength,"short");
  assert.equal(result.settings.teasingStyle,"playful");
  assert.equal(result.autoFields.includes("humorLevel"),false);
  assert.equal(result.autoFields.includes("languages"),false);
});
test("per-chat manual values take priority, even numeric zero and a language mix", () => {
  const cfg = { messageLength:"medium" as const, directness:0, humorLevel:0, teasingStyle:"none" as const, doubleTexting:"avoid" as const, languages:{fr:0,en:100,darija:0} };
  const r=resolveAdaptiveStyle(cfg,defaults,[{direction:"incoming",text:"salut comment ça va ?"}],"bonjour tu vas bien ?",Object.keys(cfg));
  assert.deepEqual(r.settings,cfg);
  assert.deepEqual(r.autoFields,[]);
  assert.equal(r.reasons.languages,"manual chat override");
});
test("French and English mix adapts only after repeated clear evidence; languages are isolated", () => {
  const history = [{direction:"incoming" as const,text:"hello how are you doing today?"},{direction:"incoming" as const,text:"hey what are your plans tomorrow?"},{direction:"incoming" as const,text:"nice! that sounds good with you"}];
  const r=resolveAdaptiveStyle({},defaults,history,"and what are you doing this weekend?");
  assert.ok((r.settings.languages?.en ?? 0)>15);
  assert.equal(Object.values(r.settings.languages!).reduce((a,b)=>a+b,0),100);
  const another=resolveAdaptiveStyle({},defaults,[],"bonjour comment ça va ?");
  assert.deepEqual(another.settings.languages,{fr:45,darija:40,en:15});
});
test("legacy fixed selections stay fixed; legacy auto values migrate to anchored adaptation",()=>{
  const old={messageLength:"medium",directness:"very-direct",humorStyle:"dry",teasingStyle:"bold",doubleTexting:"comfortable"};
  const result=resolveAdaptiveStyle({},old,[{direction:"incoming",text:"lol 😂"},{direction:"incoming",text:"haha 😂"}],"haha 😂");
  assert.deepEqual([result.settings.messageLength,result.settings.directness,result.settings.humorLevel,result.settings.teasingStyle,result.settings.doubleTexting],["medium",90,30,"bold","comfortable"]);
  assert.ok(result.autoFields.includes("languages"));
  const auto=resolveAdaptiveStyle({}, {messageLength:"auto-adaptive", humorStyle:"auto-adaptive"},[], "hi");
  assert.equal(auto.settings.messageLength,"short");
  assert.equal(auto.settings.humorLevel,60);
});
