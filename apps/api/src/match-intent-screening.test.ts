import assert from "node:assert/strict";
import test from "node:test";
import { assessMatchIntent, matchScreeningPrompt } from "./match-intent-screening.js";

const out = (text: string) => ({ direction: "outgoing" as const, text });
const received = (text: string) => ({ direction: "incoming" as const, text });

test("long-term partner is NOT synonymous with marriage", () => {
  const value = assessMatchIntent([], { relationshipGoal: "Long-term partner", heightCm: 169 },
    { pauseOnConfirmedMarriage: true, maximumHeightCm: 170 });
  assert.equal(value.intent, "long-term");
  assert.equal(value.action, "clarify");
  assert.equal(value.heightCm, 169);
  assert.match(matchScreeningPrompt(value), /ask naturally/i);
});
test("actual marriage statement needs a preceding clarification question before automated pause", () => {
  const prefs = { pauseOnConfirmedMarriage: true };
  assert.equal(assessMatchIntent([received("Je veux me marier")], null, prefs).action, "clarify");
  const convo = [out("Tu recherches quoi sur Tinder ?"), received("Je cherche une relation en vue du mariage")];
  const value = assessMatchIntent(convo, null, prefs);
  assert.equal(value.action, "pause");
  assert.equal(value.intent, "marriage");
  assert.equal(value.confirmedByReply, true);
  assert.equal(value.reason, "explicit-match-answer");
  assert.equal(assessMatchIntent(convo, null, { pauseOnConfirmedMarriage: false }).action, "continue");
});
test("negation and ambiguity never authorize a false marriage pause", () => {
  const c = [out("Tu cherches quoi ?"), received("Pas de mariage, je préfère du léger")];
  assert.notEqual(assessMatchIntent(c, null, { pauseOnConfirmedMarriage: true }).action, "pause");
  assert.equal(assessMatchIntent([received("sans prise de tête")], null).intent, "unknown");
  assert.equal(assessMatchIntent([out("Je cherche le mariage")], null, { pauseOnConfirmedMarriage: true }).intent, "unknown");
});
test("casual expressions guide, never infer consent or automatically pause", () => {
  const p = assessMatchIntent([received("Je cherche un plan cul")], null);
  assert.equal(p.intent, "casual");
  assert.equal(p.action, "continue");
  assert.match(matchScreeningPrompt(p), /boundaries/);
  const custom = assessMatchIntent([received("on peut se voir sans contraintes")], null,
    { casualExpressions: ["sans contraintes"] });
  assert.equal(custom.intent, "casual");
  assert.equal(custom.action, "continue");
});
test("height pause requires verified number, not an estimate", () => {
  assert.equal(assessMatchIntent([], { heightCm: 171 }, { maximumHeightCm: 170 }).action, "pause");
  assert.equal(assessMatchIntent([], { heightCm: 170 }, { maximumHeightCm: 170 }).action, "continue");
  assert.equal(assessMatchIntent([], { heightCm: null }, { maximumHeightCm: 170 }).action, "continue");
  assert.equal(assessMatchIntent([], { heightCm: 500 }, { maximumHeightCm: 170 }).action, "continue");
});

test("a two-letter custom expression is recognized only as a whole word", () => {
  const options = { casualExpressions: ["plan payant", "pp"] };
  assert.equal(assessMatchIntent([received("Tu cherches un pp ?")], null, options).intent, "casual");
  assert.equal(assessMatchIntent([received("Je ne suis pas happy")], null, options).intent, "unknown");
  assert.equal(assessMatchIntent([received("On parle d'une app")], null, options).intent, "unknown");
  assert.equal(assessMatchIntent([received("Plan payant, c'est ça ?")], null, options).intent, "casual");
  assert.equal(assessMatchIntent([out("Moi j'utilise le mot pp")], null, options).intent, "unknown");
});
