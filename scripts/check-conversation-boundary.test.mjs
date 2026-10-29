import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptStructuredBoundaryDecision as accept,
  parseStructuredBoundaryDecision as parse,
  UNCERTAIN_BOUNDARY
} from "../src/conversation-boundary-policy.ts";

const exchange = (...rows) => rows.map(([direction, text]) => ({direction,text}));
const decision = (kind,evidence,platform="none",confidence=0.98) =>
  parse({kind,evidence,platform,confidence});

test("structured Gemini boundary outcome, not text regex, determines whether to pause a conversation", () => {
  const unusual = exchange(["outgoing","Bonne nuit"],["incoming","M3a slama, daba ra n3as 🙏"]);
  assert.equal(accept(decision("rest","mutual-signoff"),unusual).kind,"rest");
  assert.equal(accept(decision("continue","ongoing"),unusual).kind,"continue");
  assert.equal(accept(decision("acknowledgement","plain-acknowledgement"),unusual).kind,"acknowledgement");
});
test("validated outside-app handoff and explicit no-contact require matching evidence", () => {
  const history = exchange(["outgoing","Want to continue elsewhere?"],["incoming","Yes sure"]);
  assert.deepEqual(accept(decision("off-tinder","accepted-handoff","whatsapp"),history),{
    kind:"off-tinder",platform:"whatsapp",confidence:0.98,evidence:"accepted-handoff"
  });
  assert.equal(accept(decision("off-tinder","direct-handoff","telegram"),exchange(["incoming","Let's chat there"])).kind,"off-tinder");
  assert.equal(accept(decision("do-not-contact","explicit-stop"),exchange(["incoming","Do not contact me"])).kind,"do-not-contact");
});
test("bad or low-confidence model outputs always become unknown rather than continue", () => {
  for (const obj of [
    {},null,[],{kind:"continue",evidence:"ongoing",platform:"none",confidence:"1"},
    {kind:"off-tinder",evidence:"direct-handoff",platform:"none",confidence:1},
    {kind:"continue",evidence:"ongoing",platform:"instagram",confidence:1},
    {kind:"send-now",evidence:"ongoing",platform:"none",confidence:1},
    {kind:"continue",evidence:"ongoing",platform:"none",confidence:NaN}
  ]) assert.deepEqual(parse(obj),UNCERTAIN_BOUNDARY);
  assert.deepEqual(accept(decision("continue","ongoing","none",0.89),
    exchange(["incoming","Hi"])),UNCERTAIN_BOUNDARY);
  assert.deepEqual(accept(decision("rest","unclear"),
    exchange(["outgoing","Bye"],["incoming","bye"])),UNCERTAIN_BOUNDARY);
  assert.deepEqual(accept(decision("off-tinder","accepted-handoff","instagram"),
    exchange(["incoming","@someuser"])),UNCERTAIN_BOUNDARY);
  assert.deepEqual(accept(decision("acknowledgement","plain-acknowledgement"),
    exchange(["incoming","ok"])),UNCERTAIN_BOUNDARY);
});
test("no outgoing-only, empty, or invalid last-message direction can approve model output", () => {
  for (const rows of [[],exchange(["outgoing","Bye"]),[{direction:"unknown",text:"hi"}]]) {
    assert.deepEqual(accept(decision("continue","ongoing"),rows),UNCERTAIN_BOUNDARY);
  }
});
