import assert from "node:assert/strict";
import { classifySwipeCardTransition, isProvenNoClickResult } from "../src/tinder-swipe-card-transition-policy.ts";
const different = classifySwipeCardTransition("card1","card2",true,true,false);
assert.deepEqual(different,{status:"ui_observed",reason:"new_card_visually_observed",serverConfirmed:false});
assert.equal(classifySwipeCardTransition("card1","card1",true,true,false).status,"uncertain");
assert.equal(classifySwipeCardTransition("card1","card2",false,true,false).status,"uncertain");
assert.equal(classifySwipeCardTransition("card1","card2",true,true,true).status,"uncertain");
assert.equal(classifySwipeCardTransition("card1",null,true,true,false).status,"uncertain");
assert.equal(classifySwipeCardTransition("card1","card2",true,false,false).status,"uncertain");
console.log("Tinder UI card change classifications passed; no Like server receipt is claimed.");

for (const reason of ["another_like_in_flight", "recent_user_interaction",
  "unsafe_discovery_state", "like_or_card_not_unique", "preflight_state_changed"]) {
  assert.equal(isProvenNoClickResult({
    status: "blocked", reason, serverConfirmed: false
  }), true, reason);
}
for (const [status, reason] of [
  ["uncertain", "card_transition_timeout"],
  ["uncertain", "like_action_exception"],
  ["blocked", "unknown_status"],
  ["ui_observed", "new_card_visually_observed"],
  ["blocked", "modal_or_navigation_after_click"]
]) {
  assert.equal(isProvenNoClickResult({ status, reason, serverConfirmed: false }),
    false, status + "/" + reason);
}
